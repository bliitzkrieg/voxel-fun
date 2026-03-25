import * as THREE from 'three';

export interface WaterShaderMaterial extends THREE.ShaderMaterial {
	uniforms: {
		uTime: { value: number };
		uVoxelScale: { value: number };
		uSunDirection: { value: THREE.Vector3 };
		uSunColor: { value: THREE.Color };
		uSunIntensity: { value: number };
		uSkyColor: { value: THREE.Color };
		uGroundColor: { value: THREE.Color };
		uFogHeightStrength: { value: number };
		uFogHeightFalloff: { value: number };
		fogColor: { value: THREE.Color };
		fogNear: { value: number };
		fogFar: { value: number };
	};
}

export function createVoxelWaterMaterial(): WaterShaderMaterial {
	const uniforms = THREE.UniformsUtils.merge([
		THREE.UniformsLib.fog,
		{
			uTime: { value: 0 },
			uVoxelScale: { value: 1 },
			uSunDirection: { value: new THREE.Vector3(0.3, 1, 0.2).normalize() },
			uSunColor: { value: new THREE.Color('#ffe2bd') },
			uSunIntensity: { value: 1 },
			uSkyColor: { value: new THREE.Color('#d5e7ef') },
			uGroundColor: { value: new THREE.Color('#8d8174') },
			uFogHeightStrength: { value: 0.2 },
			uFogHeightFalloff: { value: 0.18 }
		}
	]) as WaterShaderMaterial['uniforms'];

	return new THREE.ShaderMaterial({
		uniforms,
		vertexShader: `
			attribute float voxelAo;
			attribute vec2 voxelWater;

			varying vec4 vColor;
			varying vec3 vWorldPosition;
			varying vec3 vWorldNormal;
			varying float vVoxelAo;
			varying vec2 vVoxelWater;

			#include <fog_pars_vertex>

			void main() {
				vColor = color;
				vVoxelAo = voxelAo;
				vVoxelWater = voxelWater;

				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vWorldPosition = worldPosition.xyz;
				vWorldNormal = normalize(mat3(modelMatrix) * normal);

				vec4 mvPosition = viewMatrix * worldPosition;
				gl_Position = projectionMatrix * mvPosition;

				#include <fog_vertex>
			}
		`,
		fragmentShader: `
			uniform float uTime;
			uniform float uVoxelScale;
			uniform vec3 uSunDirection;
			uniform vec3 uSunColor;
			uniform float uSunIntensity;
			uniform vec3 uSkyColor;
			uniform vec3 uGroundColor;
			uniform float uFogHeightStrength;
			uniform float uFogHeightFalloff;

			varying vec4 vColor;
			varying vec3 vWorldPosition;
			varying vec3 vWorldNormal;
			varying float vVoxelAo;
			varying vec2 vVoxelWater;

			#include <common>
			#include <fog_pars_fragment>

			float lowWave(vec2 p) {
				float swell = sin(p.x * 0.12 + uTime * 0.16);
				float drift = cos(p.y * 0.1 - uTime * 0.12);
				float cross = sin((p.x + p.y) * 0.08 + uTime * 0.09);
				return swell * 0.55 + drift * 0.35 + cross * 0.18;
			}

			float rippleWave(vec2 p) {
				float rippleA = sin(p.x * 0.55 + p.y * 0.32 - uTime * 0.65);
				float rippleB = cos(p.x * 0.28 - p.y * 0.47 + uTime * 0.58);
				return rippleA * 0.55 + rippleB * 0.45;
			}

			float surfaceHeight(vec2 p) {
				return lowWave(p) + rippleWave(p) * 0.28;
			}

			float sideHeight(vec2 p) {
				float drift = sin(p.x * 0.34 + uTime * 0.18);
				float ripple = cos((p.x + p.y) * 0.24 - uTime * 0.28);
				return drift * 0.18 + ripple * 0.09;
			}

			vec3 computeWaterNormal(vec3 voxelPos, vec3 baseNormal, out float topMask) {
				const float sampleOffset = 0.08;
				topMask = smoothstep(0.74, 0.98, abs(baseNormal.y));

				if (topMask > 0.5) {
					vec2 p = voxelPos.xz;
					float center = surfaceHeight(p);
					float dx = surfaceHeight(p + vec2(sampleOffset, 0.0)) - center;
					float dz = surfaceHeight(p + vec2(0.0, sampleOffset)) - center;
					return normalize(vec3(-dx * 1.55, sign(baseNormal.y), -dz * 1.55));
				}

				if (abs(baseNormal.x) > 0.5) {
					vec2 p = vec2(voxelPos.z, voxelPos.y);
					float center = sideHeight(p);
					float dz = sideHeight(p + vec2(sampleOffset, 0.0)) - center;
					float dy = sideHeight(p + vec2(0.0, sampleOffset)) - center;
					return normalize(vec3(sign(baseNormal.x), -dy * 0.42, -dz * 0.42));
				}

				vec2 p = vec2(voxelPos.x, voxelPos.y);
				float center = sideHeight(p);
				float dx = sideHeight(p + vec2(sampleOffset, 0.0)) - center;
				float dy = sideHeight(p + vec2(0.0, sampleOffset)) - center;
				return normalize(vec3(-dx * 0.42, -dy * 0.42, sign(baseNormal.z)));
			}

			void main() {
				vec3 voxelPos = vWorldPosition / max(uVoxelScale, 0.0001);
				float topMask = 0.0;
				vec3 normalDir = computeWaterNormal(voxelPos, normalize(vWorldNormal), topMask);
				vec3 viewDir = normalize(cameraPosition - vWorldPosition);
				vec3 sunDir = normalize(uSunDirection);
				vec3 reflectedView = reflect(-viewDir, normalDir);
				vec3 halfVector = normalize(sunDir + viewDir);
				float fresnel = pow(1.0 - max(dot(normalDir, viewDir), 0.0), 3.6);
				float specular = pow(max(dot(normalDir, halfVector), 0.0), mix(26.0, 54.0, topMask));
				float sunGlint = specular * (0.12 + 0.12 * topMask) * (0.72 + 0.28 * vVoxelWater.y) * uSunIntensity;
				float waterDepth = clamp(vVoxelWater.x, 0.0, 1.0);
				float openness = clamp(vVoxelWater.y, 0.0, 1.0);
				float shallowMask = clamp(
					(1.0 - waterDepth) * (0.58 + topMask * 0.26) + (1.0 - vVoxelAo) * 0.18,
					0.0,
					1.0
				);

				vec3 baseTint = mix(vColor.rgb, vec3(0.05, 0.33, 0.48), 0.46);
				vec3 deepTint = mix(vec3(0.02, 0.09, 0.16), baseTint * vec3(0.24, 0.56, 0.78), 0.64);
				vec3 shallowTint = mix(vec3(0.08, 0.28, 0.34), baseTint * vec3(0.78, 1.02, 0.98), 0.72);
				vec3 bodyColor = mix(deepTint, shallowTint, shallowMask);
				bodyColor *= mix(0.93, 1.0, vVoxelAo);

				float skyMix = smoothstep(-0.18, 0.78, reflectedView.y + normalDir.y * 0.12);
				vec3 environmentReflection = mix(
					uGroundColor * vec3(0.18, 0.22, 0.24),
					uSkyColor * vec3(0.6, 0.76, 0.9),
					skyMix
				);
				environmentReflection = mix(environmentReflection, shallowTint, 0.18 + shallowMask * 0.12);

				float reflectionStrength = clamp(
					0.08 + topMask * 0.08 + fresnel * 0.34 + openness * 0.04,
					0.0,
					0.58
				);
				vec3 glintColor = mix(uSunColor, vec3(0.9, 0.96, 1.0), 0.36) * sunGlint * 0.6;
				vec3 grazingColor = shallowTint * smoothstep(0.14, 1.0, fresnel) * (0.05 + topMask * 0.06);
				vec3 finalColor =
					mix(bodyColor, environmentReflection, reflectionStrength) +
					glintColor +
					grazingColor;

				float hazeDistance = length(cameraPosition - vWorldPosition);
				float aerialDistance = smoothstep(fogNear * 0.4, fogFar * 0.9, hazeDistance);
				float heightFalloff = exp(-max(vWorldPosition.y - 1.5, 0.0) * uFogHeightFalloff);
				float aerialFog = aerialDistance * heightFalloff * uFogHeightStrength;
				vec3 aerialColor = mix(fogColor, uSkyColor, 0.18);
				finalColor = mix(finalColor, aerialColor, aerialFog);

				float luma = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
				vec3 graded = mix(vec3(luma), finalColor, 1.03);
				vec3 splitTone = mix(
					vec3(0.95, 0.99, 1.04),
					vec3(1.04, 1.0, 0.95),
					smoothstep(0.18, 0.92, luma)
				);
				finalColor = mix(graded, graded * splitTone, 0.06);

				float alpha = clamp(vColor.a * (0.54 + fresnel * 0.18 + topMask * 0.1), 0.28, 0.86);
				gl_FragColor = vec4(finalColor, alpha);

				#include <tonemapping_fragment>
				#include <colorspace_fragment>
				#include <fog_fragment>
			}
		`,
		vertexColors: true,
		transparent: true,
		side: THREE.DoubleSide,
		depthWrite: false,
		fog: true,
		dithering: true
	}) as WaterShaderMaterial;
}
