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
	giEnabled: boolean;
	giAtlas: THREE.DataTexture;
	giAtlasSize: THREE.Vector2;
	giWorldOrigin: THREE.Vector3;
	giVolumeSize: THREE.Vector3;
	giCellSize: number;
	giIntensity: number;
	giClassicBounceScale: number;
	giVisibilityFloor: number;
}

interface VoxelSurfaceUniforms {
	uSunDirection: { value: THREE.Vector3 };
	uSunColor: { value: THREE.Color };
	uSunIntensity: { value: number };
	uSkyColor: { value: THREE.Color };
	uGroundColor: { value: THREE.Color };
	uFogHeightStrength: { value: number };
	uFogHeightFalloff: { value: number };
	uGiEnabled: { value: number };
	uGiAtlas: { value: THREE.DataTexture };
	uGiAtlasSize: { value: THREE.Vector2 };
	uGiWorldOrigin: { value: THREE.Vector3 };
	uGiVolumeSize: { value: THREE.Vector3 };
	uGiCellSize: { value: number };
	uGiIntensity: { value: number };
	uGiClassicBounceScale: { value: number };
	uGiVisibilityFloor: { value: number };
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
		transparent ? 'voxel-surface-material-transparent-v3' : 'voxel-surface-material-opaque-v3';

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
	uniforms.uGiEnabled.value = lighting.giEnabled ? 1 : 0;
	uniforms.uGiAtlas.value = lighting.giAtlas;
	uniforms.uGiAtlasSize.value.copy(lighting.giAtlasSize);
	uniforms.uGiWorldOrigin.value.copy(lighting.giWorldOrigin);
	uniforms.uGiVolumeSize.value.copy(lighting.giVolumeSize);
	uniforms.uGiCellSize.value = lighting.giCellSize;
	uniforms.uGiIntensity.value = lighting.giIntensity;
	uniforms.uGiClassicBounceScale.value = lighting.giClassicBounceScale;
	uniforms.uGiVisibilityFloor.value = lighting.giVisibilityFloor;
}

function createVoxelSurfaceUniforms(): VoxelSurfaceUniforms {
	const giAtlas = new THREE.DataTexture(
		new Uint8Array([0, 0, 0, 255]),
		1,
		1,
		THREE.RGBAFormat,
		THREE.UnsignedByteType
	);

	giAtlas.minFilter = THREE.LinearFilter;
	giAtlas.magFilter = THREE.LinearFilter;
	giAtlas.wrapS = THREE.ClampToEdgeWrapping;
	giAtlas.wrapT = THREE.ClampToEdgeWrapping;
	giAtlas.generateMipmaps = false;
	giAtlas.unpackAlignment = 1;
	giAtlas.needsUpdate = true;

	return {
		uSunDirection: { value: new THREE.Vector3(0.42, 0.84, 0.34).normalize() },
		uSunColor: { value: new THREE.Color('#ffe2bd') },
		uSunIntensity: { value: 1.9 },
		uSkyColor: { value: new THREE.Color('#d5e7ef') },
		uGroundColor: { value: new THREE.Color('#8d8174') },
		uFogHeightStrength: { value: 0.18 },
		uFogHeightFalloff: { value: 0.18 },
		uGiEnabled: { value: 0 },
		uGiAtlas: { value: giAtlas },
		uGiAtlasSize: { value: new THREE.Vector2(1, 1) },
		uGiWorldOrigin: { value: new THREE.Vector3() },
		uGiVolumeSize: { value: new THREE.Vector3(1, 1, 1) },
		uGiCellSize: { value: 1 },
		uGiIntensity: { value: 0 },
		uGiClassicBounceScale: { value: 0.26 },
		uGiVisibilityFloor: { value: 0.18 }
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
uniform float uGiEnabled;
uniform sampler2D uGiAtlas;
uniform vec2 uGiAtlasSize;
uniform vec3 uGiWorldOrigin;
uniform vec3 uGiVolumeSize;
uniform float uGiCellSize;
uniform float uGiIntensity;
uniform float uGiClassicBounceScale;
uniform float uGiVisibilityFloor;
varying float vVoxelAo;
varying vec4 vVoxelSurface;
varying vec3 vVoxelEmissive;
varying vec3 vVoxelWorldPosition;

vec4 sampleGiAtlasCell( vec3 cellCoord ) {
	vec3 clampedCell = clamp( cellCoord, vec3( 0.0 ), uGiVolumeSize - vec3( 1.0 ) );
	float atlasX = clampedCell.x + clampedCell.z * uGiVolumeSize.x;
	vec2 atlasUv = vec2(
		( atlasX + 0.5 ) / max( uGiAtlasSize.x, 1.0 ),
		( clampedCell.y + 0.5 ) / max( uGiAtlasSize.y, 1.0 )
	);
	return texture2D( uGiAtlas, atlasUv );
}

vec4 sampleGiVolume( vec3 worldPosition ) {
	if ( uGiEnabled < 0.5 ) {
		return vec4( 0.0, 0.0, 0.0, 1.0 );
	}

	float cellSize = max( uGiCellSize, 0.0001 );
	vec3 cellPosition = ( worldPosition - uGiWorldOrigin ) / cellSize;

	if ( any( lessThan( cellPosition, vec3( 0.0 ) ) ) || any( greaterThan( cellPosition, uGiVolumeSize ) ) ) {
		return vec4( 0.0, 0.0, 0.0, 1.0 );
	}

	vec3 voxelPosition = cellPosition - vec3( 0.5 );
	vec3 baseCell = floor( voxelPosition );
	vec3 cellBlend = fract( voxelPosition );
	vec4 x00 = mix(
		sampleGiAtlasCell( baseCell + vec3( 0.0, 0.0, 0.0 ) ),
		sampleGiAtlasCell( baseCell + vec3( 1.0, 0.0, 0.0 ) ),
		cellBlend.x
	);
	vec4 x10 = mix(
		sampleGiAtlasCell( baseCell + vec3( 0.0, 1.0, 0.0 ) ),
		sampleGiAtlasCell( baseCell + vec3( 1.0, 1.0, 0.0 ) ),
		cellBlend.x
	);
	vec4 x01 = mix(
		sampleGiAtlasCell( baseCell + vec3( 0.0, 0.0, 1.0 ) ),
		sampleGiAtlasCell( baseCell + vec3( 1.0, 0.0, 1.0 ) ),
		cellBlend.x
	);
	vec4 x11 = mix(
		sampleGiAtlasCell( baseCell + vec3( 0.0, 1.0, 1.0 ) ),
		sampleGiAtlasCell( baseCell + vec3( 1.0, 1.0, 1.0 ) ),
		cellBlend.x
	);
	vec4 z0 = mix( x00, x01, cellBlend.z );
	vec4 z1 = mix( x10, x11, cellBlend.z );
	return mix( z0, z1, cellBlend.y );
}`
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
float giBlend = clamp( uGiEnabled, 0.0, 1.0 );
vec4 giSample = sampleGiVolume( vVoxelWorldPosition );
float giVisibility = mix( 1.0, clamp( giSample.a, uGiVisibilityFloor, 1.0 ), giBlend );
float giMaterialScale = mix( 0.55, 1.0, saturate( diffuseColor.a ) );
reflectedLight.directDiffuse *= mix( 0.82, 1.0, voxelAo );
reflectedLight.indirectDiffuse *= mix( 0.52, 1.0, voxelAo ) * giVisibility;
reflectedLight.indirectSpecular *= mix( 0.86, 1.0, voxelAo ) * mix( 1.0, giVisibility, 0.65 );
vec3 bounceLight =
	uSkyColor * ( 0.028 + 0.092 * skyMask ) +
	uGroundColor * ( 0.022 + 0.088 * groundMask * ( 0.6 + cavity * 0.4 ) ) +
	uSunColor * ( 0.012 + 0.028 * sunWrap ) * uSunIntensity;
vec3 classicBounce = bounceLight * mix( 1.0, uGiClassicBounceScale, giBlend );
vec3 giBounce = giSample.rgb * uGiIntensity * giMaterialScale;
reflectedLight.indirectDiffuse += diffuseColor.rgb * classicBounce * vVoxelSurface.z * voxelAo;
reflectedLight.indirectDiffuse += diffuseColor.rgb * giBounce * vVoxelSurface.z * voxelAo;
vec3 cavityTint = mix( uGroundColor, uSkyColor, 0.2 + skyMask * 0.45 );
reflectedLight.indirectDiffuse += diffuseColor.rgb * cavityTint * cavity * mix( 0.04, 0.015, giBlend );
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
