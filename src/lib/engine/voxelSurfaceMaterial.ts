import * as THREE from 'three';

export interface VoxelSurfaceLightingState {
	sunDirection: THREE.Vector3;
	sunColor: THREE.Color;
	sunIntensity: number;
	skyColor: THREE.Color;
	groundColor: THREE.Color;
	fogColor: THREE.Color;
	fogNear: number;
	fogFar: number;
	heightFogStrength: number;
	heightFogFalloff: number;
}

interface VoxelSurfaceUniforms {
	uSunDirection: { value: THREE.Vector3 };
	uSunColor: { value: THREE.Color };
	uSunIntensity: { value: number };
	uSkyColor: { value: THREE.Color };
	uGroundColor: { value: THREE.Color };
	uFogHeightStrength: { value: number };
	uFogHeightFalloff: { value: number };
}

export interface VoxelSurfaceMaterial extends THREE.MeshStandardMaterial {
	userData: THREE.MeshStandardMaterial['userData'] & {
		voxelUniforms: VoxelSurfaceUniforms;
	};
}

export function createVoxelSurfaceMaterial(options?: {
	transparent?: boolean;
}): VoxelSurfaceMaterial {
	const transparent = options?.transparent ?? false;
	const material = new THREE.MeshStandardMaterial({
		vertexColors: true,
		roughness: transparent ? 0.76 : 0.94,
		metalness: transparent ? 0.02 : 0.04,
		transparent,
		depthWrite: !transparent,
		opacity: 1,
		fog: true,
		dithering: true
	}) as VoxelSurfaceMaterial;
	const voxelUniforms = createVoxelSurfaceUniforms();

	material.userData.voxelUniforms = voxelUniforms;
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, voxelUniforms);
		shader.vertexShader = patchVertexShader(shader.vertexShader);
		shader.fragmentShader = patchFragmentShader(shader.fragmentShader);
	};
	material.customProgramCacheKey = () =>
		transparent ? 'voxel-surface-material-transparent-v1' : 'voxel-surface-material-opaque-v1';

	return material;
}

export function syncVoxelSurfaceMaterial(
	material: VoxelSurfaceMaterial,
	lighting: VoxelSurfaceLightingState
): void {
	const uniforms = material.userData.voxelUniforms;

	uniforms.uSunDirection.value.copy(lighting.sunDirection);
	uniforms.uSunColor.value.copy(lighting.sunColor);
	uniforms.uSunIntensity.value = lighting.sunIntensity;
	uniforms.uSkyColor.value.copy(lighting.skyColor);
	uniforms.uGroundColor.value.copy(lighting.groundColor);
	uniforms.uFogHeightStrength.value = lighting.heightFogStrength;
	uniforms.uFogHeightFalloff.value = lighting.heightFogFalloff;
}

function createVoxelSurfaceUniforms(): VoxelSurfaceUniforms {
	return {
		uSunDirection: { value: new THREE.Vector3(0.42, 0.84, 0.34).normalize() },
		uSunColor: { value: new THREE.Color('#ffe2bd') },
		uSunIntensity: { value: 1.9 },
		uSkyColor: { value: new THREE.Color('#d5e7ef') },
		uGroundColor: { value: new THREE.Color('#8d8174') },
		uFogHeightStrength: { value: 0.18 },
		uFogHeightFalloff: { value: 0.18 }
	};
}

function patchVertexShader(source: string): string {
	return source
		.replace(
			'#include <color_pars_vertex>',
			`#include <color_pars_vertex>
attribute float voxelAo;
attribute vec4 voxelSurface;
attribute vec3 voxelEmissive;
varying float vVoxelAo;
varying vec4 vVoxelSurface;
varying vec3 vVoxelEmissive;
varying vec3 vVoxelWorldPosition;`
		)
		.replace(
			'#include <worldpos_vertex>',
			`#include <worldpos_vertex>
	vVoxelAo = voxelAo;
	vVoxelSurface = voxelSurface;
	vVoxelEmissive = voxelEmissive;
	vVoxelWorldPosition = worldPosition.xyz;`
		);
}

function patchFragmentShader(source: string): string {
	return source
		.replace(
			'#include <color_pars_fragment>',
			`#include <color_pars_fragment>
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform float uFogHeightStrength;
uniform float uFogHeightFalloff;
varying float vVoxelAo;
varying vec4 vVoxelSurface;
varying vec3 vVoxelEmissive;
varying vec3 vVoxelWorldPosition;`
		)
		.replace(
			'#include <roughnessmap_fragment>',
			`#include <roughnessmap_fragment>
roughnessFactor = clamp( mix( roughnessFactor, vVoxelSurface.x, 0.94 ), 0.04, 1.0 );`
		)
		.replace(
			'#include <metalnessmap_fragment>',
			`#include <metalnessmap_fragment>
metalnessFactor = clamp( mix( metalnessFactor, vVoxelSurface.y, 0.96 ), 0.0, 1.0 );`
		)
		.replace(
			'#include <aomap_fragment>',
			`#include <aomap_fragment>
float voxelAo = clamp( vVoxelAo, 0.0, 1.0 );
float cavity = 1.0 - voxelAo;
vec3 voxelWorldNormal = normalize( inverseTransformDirection( geometryNormal, viewMatrix ) );
vec3 sunDirection = normalize( uSunDirection );
float skyMask = saturate( voxelWorldNormal.y * 0.5 + 0.5 );
float groundMask = 1.0 - skyMask;
float sunWrap = saturate( dot( voxelWorldNormal, sunDirection ) * 0.45 + 0.55 );
reflectedLight.directDiffuse *= mix( 0.82, 1.0, voxelAo );
reflectedLight.indirectDiffuse *= mix( 0.52, 1.0, voxelAo );
reflectedLight.indirectSpecular *= mix( 0.86, 1.0, voxelAo );
vec3 bounceLight =
	uSkyColor * ( 0.028 + 0.092 * skyMask ) +
	uGroundColor * ( 0.022 + 0.088 * groundMask * ( 0.6 + cavity * 0.4 ) ) +
	uSunColor * ( 0.012 + 0.028 * sunWrap ) * uSunIntensity;
reflectedLight.indirectDiffuse += diffuseColor.rgb * bounceLight * vVoxelSurface.z * voxelAo;
vec3 cavityTint = mix( uGroundColor, uSkyColor, 0.2 + skyMask * 0.45 );
reflectedLight.indirectDiffuse += diffuseColor.rgb * cavityTint * cavity * 0.04;
totalEmissiveRadiance += vVoxelEmissive * ( 0.18 + cavity * 0.12 );`
		)
		.replace(
			'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
			`vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
float grazing = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 );
outgoingLight += diffuseColor.rgb * grazing * vVoxelSurface.w * 0.04;
float hazeDistance = length( cameraPosition - vVoxelWorldPosition );
float aerialDistance = smoothstep( fogNear * 0.45, fogFar * 0.92, hazeDistance );
float heightFalloff = exp( -max( vVoxelWorldPosition.y - 1.5, 0.0 ) * uFogHeightFalloff );
float aerialFog = aerialDistance * heightFalloff * uFogHeightStrength;
vec3 aerialColor = mix( fogColor, uSkyColor, 0.22 );
outgoingLight = mix( outgoingLight, aerialColor, aerialFog );
float luma = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
vec3 graded = mix( vec3( luma ), outgoingLight, 1.04 );
vec3 splitTone = mix(
	vec3( 0.95, 0.98, 1.03 ),
	vec3( 1.04, 1.0, 0.96 ),
	smoothstep( 0.18, 0.92, luma )
);
outgoingLight = mix( graded, graded * splitTone, 0.08 );`
		);
}
