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
			uSunColor: { value: new THREE.Color('#fff3d6') },
			uSunIntensity: { value: 1 },
			uSkyColor: { value: new THREE.Color('#dff4ff') },
			uGroundColor: { value: new THREE.Color('#9e9388') }
		}
	]) as WaterShaderMaterial['uniforms'];

	return new THREE.ShaderMaterial({
		uniforms,
		vertexShader: `
			varying vec4 vColor;
			varying vec3 vWorldPosition;
			varying vec3 vWorldNormal;

			#include <fog_pars_vertex>

			void main() {
				vColor = color;
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

			varying vec4 vColor;
			varying vec3 vWorldPosition;
			varying vec3 vWorldNormal;

			#include <common>
			#include <fog_pars_fragment>

			float surfaceHeight(vec2 p) {
				float swellA = sin(p.x * 0.18 + uTime * 0.28);
				float swellB = cos(p.y * 0.16 - uTime * 0.22);
				float drift = sin((p.x + p.y) * 0.24 + uTime * 0.18);
				float rippleA = sin((p.x * 0.92 + p.y * 0.58) - uTime * 0.82);
				float rippleB = cos((p.x * 0.66 - p.y * 1.06) + uTime * 0.74);
				float micro = sin((p.x + p.y) * 2.25 - uTime * 1.32) * 0.05;
				return swellA * 0.46 + swellB * 0.28 + drift * 0.16 + rippleA * 0.07 + rippleB * 0.05 + micro;
			}

			float sideHeight(vec2 p) {
				float drift = sin(p.x * 0.82 + uTime * 0.42);
				float ripple = sin(p.y * 1.18 - uTime * 0.92);
				float cross = sin((p.x + p.y) * 0.74 + uTime * 0.35);
				return drift * 0.24 + ripple * 0.14 + cross * 0.08;
			}

			float sparkleField(vec2 p) {
				float pulseA = sin(p.x * 1.38 - uTime * 1.08);
				float pulseB = sin((p.x + p.y) * 1.82 + uTime * 0.76);
				float pulseC = cos(p.y * 2.14 - uTime * 1.22);
				return pulseA * 0.42 + pulseB * 0.34 + pulseC * 0.24;
			}

			vec3 computeWaterNormal(vec3 voxelPos, vec3 baseNormal, out float crest, out float topMask, out float rippleMask) {
				const float sampleOffset = 0.06;
				topMask = smoothstep(0.72, 0.98, abs(baseNormal.y));

				if (topMask > 0.5) {
					vec2 p = voxelPos.xz;
					float center = surfaceHeight(p);
					float dx = surfaceHeight(p + vec2(sampleOffset, 0.0)) - center;
					float dz = surfaceHeight(p + vec2(0.0, sampleOffset)) - center;
					float slope = clamp(length(vec2(dx, dz)) * 9.5, 0.0, 1.0);
					crest = smoothstep(0.22, 0.72, slope);
					rippleMask = smoothstep(0.08, 0.52, abs(center));
					return normalize(vec3(-dx * 2.4, sign(baseNormal.y), -dz * 2.4));
				}

				if (abs(baseNormal.x) > 0.5) {
					vec2 p = vec2(voxelPos.z, voxelPos.y);
					float center = sideHeight(p);
					float dz = sideHeight(p + vec2(sampleOffset, 0.0)) - center;
					float dy = sideHeight(p + vec2(0.0, sampleOffset)) - center;
					crest = smoothstep(0.28, 0.66, abs(center)) * 0.2;
					rippleMask = smoothstep(0.1, 0.5, abs(center));
					return normalize(vec3(sign(baseNormal.x), -dy * 1.05, -dz * 1.05));
				}

				vec2 p = vec2(voxelPos.x, voxelPos.y);
				float center = sideHeight(p);
				float dx = sideHeight(p + vec2(sampleOffset, 0.0)) - center;
				float dy = sideHeight(p + vec2(0.0, sampleOffset)) - center;
				crest = smoothstep(0.28, 0.66, abs(center)) * 0.2;
				rippleMask = smoothstep(0.1, 0.5, abs(center));
				return normalize(vec3(-dx * 1.05, -dy * 1.05, sign(baseNormal.z)));
			}

			void main() {
				vec3 voxelPos = vWorldPosition / max(uVoxelScale, 0.0001);
				float crest = 0.0;
				float topMask = 0.0;
				float rippleMask = 0.0;
				vec3 normalDir = computeWaterNormal(
					voxelPos,
					normalize(vWorldNormal),
					crest,
					topMask,
					rippleMask
				);
				vec3 viewDir = normalize(cameraPosition - vWorldPosition);
				vec3 sunDir = normalize(uSunDirection);
				vec3 reflectedView = reflect(-viewDir, normalDir);
				vec3 halfVector = normalize(sunDir + viewDir);
				float fresnel = pow(1.0 - max(dot(normalDir, viewDir), 0.0), 4.2);
				float sunFacing = max(dot(normalDir, sunDir), 0.0);
				float specular = pow(max(dot(normalDir, halfVector), 0.0), mix(54.0, 140.0, topMask));
				float sunReflection = pow(max(dot(reflectedView, sunDir), 0.0), mix(120.0, 240.0, topMask));
				float sparkle = smoothstep(0.24, 0.92, sparkleField(voxelPos.xz * 0.7 + normalDir.xz * 1.4) * 0.5 + 0.5);
				float highlight = (specular * 0.45 + sunReflection * 0.9) * (0.25 + sparkle * 0.75) * uSunIntensity;
				float rim = smoothstep(0.12, 1.0, fresnel);

				vec3 waterTint = mix(vColor.rgb, vec3(0.04, 0.46, 0.94), 0.74);
				vec3 deepBlue = mix(vec3(0.01, 0.05, 0.18), waterTint * vec3(0.16, 0.44, 0.98), 0.62);
				vec3 shallowBlue = mix(vec3(0.06, 0.28, 0.66), waterTint * vec3(0.66, 1.0, 1.2), 0.7);
				float bodyBlend = clamp(0.36 + rippleMask * 0.16 + topMask * 0.18 + sunFacing * 0.08, 0.0, 1.0);
				vec3 bodyColor = mix(deepBlue, shallowBlue, bodyBlend);

				float skyMix = smoothstep(-0.15, 0.85, reflectedView.y);
				vec3 environmentReflection = mix(uGroundColor * vec3(0.16, 0.2, 0.28), uSkyColor * vec3(0.72, 0.84, 1.0), skyMix);
				environmentReflection = mix(environmentReflection, shallowBlue, 0.24);
				float reflectionStrength = clamp((0.16 + topMask * 0.2) + fresnel * 0.46, 0.0, 0.72);

				vec3 rimColor = shallowBlue * rim * (0.08 + topMask * 0.08);
				vec3 foamColor = vec3(0.66, 0.84, 0.98) * crest * (0.03 + topMask * 0.06);
				vec3 lightReflection = mix(uSunColor, vec3(0.88, 0.96, 1.0), 0.5) * highlight * 0.46;
				vec3 finalColor =
					mix(bodyColor, environmentReflection, reflectionStrength) +
					rimColor +
					foamColor +
					lightReflection;

				float alphaBase = mix(0.94, 0.72, fresnel);
				float alpha = clamp(vColor.a * alphaBase + crest * 0.03 + rippleMask * 0.02, 0.2, 0.97);

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
		fog: true
	}) as WaterShaderMaterial;
}
