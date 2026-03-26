import * as THREE from 'three';

export type TimeOfDay = 'day' | 'night';

export interface SceneBundle {
	scene: THREE.Scene;
	ambientLight: THREE.AmbientLight;
	hemisphereLight: THREE.HemisphereLight;
	sunLight: THREE.DirectionalLight;
	fillLight: THREE.DirectionalLight;
	skyDome: THREE.Mesh<THREE.SphereGeometry, SkyMaterial>;
	timeOfDay: TimeOfDay;
}

interface ScenePreset {
	background: THREE.ColorRepresentation;
	fog: THREE.ColorRepresentation;
	fogNear: number;
	fogFar: number;
	ambientColor: THREE.ColorRepresentation;
	ambientIntensity: number;
	hemisphereSkyColor: THREE.ColorRepresentation;
	hemisphereGroundColor: THREE.ColorRepresentation;
	hemisphereIntensity: number;
	sunColor: THREE.ColorRepresentation;
	sunIntensity: number;
	fillColor: THREE.ColorRepresentation;
	fillIntensity: number;
	skyZenithColor: THREE.ColorRepresentation;
	skyHorizonColor: THREE.ColorRepresentation;
	skyGroundColor: THREE.ColorRepresentation;
	skyGlowColor: THREE.ColorRepresentation;
	skyGlowFocus: number;
	skyGlowIntensity: number;
	skyStarIntensity: number;
}

interface SkyUniforms {
	uZenithColor: { value: THREE.Color };
	uHorizonColor: { value: THREE.Color };
	uGroundColor: { value: THREE.Color };
	uGlowColor: { value: THREE.Color };
	uGlowDirection: { value: THREE.Vector3 };
	uGlowFocus: { value: number };
	uGlowIntensity: { value: number };
	uHorizonSoftness: { value: number };
	uStarIntensity: { value: number };
}

type SkyMaterial = THREE.ShaderMaterial & { uniforms: SkyUniforms };

const SKY_VERTEX_SHADER = `
varying vec3 vSkyDirection;

void main() {
	vSkyDirection = normalize(position);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT_SHADER = `
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uGroundColor;
uniform vec3 uGlowColor;
uniform vec3 uGlowDirection;
uniform float uGlowFocus;
uniform float uGlowIntensity;
uniform float uHorizonSoftness;
uniform float uStarIntensity;

varying vec3 vSkyDirection;

float hash13(vec3 p) {
	return fract(sin(dot(p, vec3(127.1, 311.7, 191.999))) * 43758.5453123);
}

float starField(vec3 direction) {
	vec3 sampleCell = floor(direction * 180.0);
	float sparkle = hash13(sampleCell);
	float starMask = smoothstep(0.9968, 0.99994, sparkle);
	float twinkle = hash13(sampleCell + vec3(17.0, 37.0, 73.0));
	return starMask * mix(0.45, 1.0, twinkle);
}

void main() {
	vec3 direction = normalize(vSkyDirection);
	float horizonBlend = smoothstep(-uHorizonSoftness, uHorizonSoftness, direction.y);
	float zenithBlend = smoothstep(0.02, 0.96, max(direction.y, 0.0));
	vec3 skyColor = mix(uGroundColor, uHorizonColor, horizonBlend);
	skyColor = mix(skyColor, uZenithColor, zenithBlend);

	float glowDot = max(dot(direction, normalize(uGlowDirection)), 0.0);
	float coreGlow = pow(glowDot, uGlowFocus) * uGlowIntensity;
	float haloGlow = pow(glowDot, max(uGlowFocus * 0.22, 2.0)) * uGlowIntensity * 0.36;
	skyColor += uGlowColor * (coreGlow + haloGlow);

	float starMask = smoothstep(-0.08, 0.36, direction.y) * uStarIntensity;
	skyColor += vec3(starField(direction) * starMask);
	skyColor = min(skyColor, vec3(1.0));

	gl_FragColor = vec4(skyColor, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

export function createGameScene(): SceneBundle {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color();
	scene.fog = new THREE.Fog('#c2cfd1', 22, 88);

	const ambientLight = new THREE.AmbientLight('#ffe7c5', 0.1);
	const hemisphereLight = new THREE.HemisphereLight('#d5e7ef', '#867c70', 0.62);
	const sunLight = new THREE.DirectionalLight('#ffe1bc', 2.05);
	const fillLight = new THREE.DirectionalLight('#bfd6e4', 0.52);
	const sunTarget = new THREE.Object3D();
	const skyDome = createSkyDome();

	sunLight.position.set(42, 18, 8);
	sunTarget.position.set(16, 5, 30);
	sunLight.target = sunTarget;
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.set(2048, 2048);
	sunLight.shadow.camera.near = 1;
	sunLight.shadow.camera.far = 84;
	sunLight.shadow.camera.left = -22;
	sunLight.shadow.camera.right = 22;
	sunLight.shadow.camera.top = 22;
	sunLight.shadow.camera.bottom = -22;
	sunLight.shadow.bias = -0.00018;
	sunLight.shadow.normalBias = 0.04;
	sunLight.shadow.radius = 2.3;
	sunLight.shadow.blurSamples = 8;

	fillLight.position.set(-20, 16, -20);

	scene.add(skyDome, ambientLight, hemisphereLight, sunLight, fillLight, sunTarget);

	const bundle: SceneBundle = {
		scene,
		ambientLight,
		hemisphereLight,
		sunLight,
		fillLight,
		skyDome,
		timeOfDay: 'day'
	};
	applySceneTimeOfDay(bundle, 'day');
	return bundle;
}

export function applySceneTimeOfDay(bundle: SceneBundle, timeOfDay: TimeOfDay): void {
	const preset = timeOfDay === 'night' ? NIGHT_PRESET : DAY_PRESET;
	const fog = bundle.scene.fog;

	bundle.scene.background = new THREE.Color(preset.background);

	if (fog instanceof THREE.Fog) {
		fog.color.set(preset.fog);
		fog.near = preset.fogNear;
		fog.far = preset.fogFar;
	}

	bundle.ambientLight.color.set(preset.ambientColor);
	bundle.ambientLight.intensity = preset.ambientIntensity;
	bundle.hemisphereLight.color.set(preset.hemisphereSkyColor);
	bundle.hemisphereLight.groundColor.set(preset.hemisphereGroundColor);
	bundle.hemisphereLight.intensity = preset.hemisphereIntensity;
	bundle.sunLight.color.set(preset.sunColor);
	bundle.sunLight.intensity = preset.sunIntensity;
	bundle.fillLight.color.set(preset.fillColor);
	bundle.fillLight.intensity = preset.fillIntensity;
	applySkyPreset(bundle, preset);
	bundle.timeOfDay = timeOfDay;
}

const DAY_PRESET: ScenePreset = {
	background: '#c4d1d3',
	fog: '#c2cfd1',
	fogNear: 22,
	fogFar: 88,
	ambientColor: '#ffe7c5',
	ambientIntensity: 0.1,
	hemisphereSkyColor: '#d5e7ef',
	hemisphereGroundColor: '#867c70',
	hemisphereIntensity: 0.62,
	sunColor: '#ffe1bc',
	sunIntensity: 1.55,
	fillColor: '#bfd6e4',
	fillIntensity: 0.52,
	skyZenithColor: '#6ea3d2',
	skyHorizonColor: '#d8eef8',
	skyGroundColor: '#f6dcc3',
	skyGlowColor: '#ffe9bf',
	skyGlowFocus: 110,
	skyGlowIntensity: 0.62,
	skyStarIntensity: 0
};

const NIGHT_PRESET: ScenePreset = {
	background: '#0a131b',
	fog: '#0d151d',
	fogNear: 18,
	fogFar: 70,
	ambientColor: '#7d9ac1',
	ambientIntensity: 0.05,
	hemisphereSkyColor: '#31485e',
	hemisphereGroundColor: '#070a10',
	hemisphereIntensity: 0.2,
	sunColor: '#98bddf',
	sunIntensity: 0.3,
	fillColor: '#7ba8c8',
	fillIntensity: 0.48,
	skyZenithColor: '#06111d',
	skyHorizonColor: '#14314c',
	skyGroundColor: '#090d15',
	skyGlowColor: '#a6caef',
	skyGlowFocus: 54,
	skyGlowIntensity: 0.22,
	skyStarIntensity: 0.72
};

function createSkyDome(): THREE.Mesh<THREE.SphereGeometry, SkyMaterial> {
	const geometry = new THREE.SphereGeometry(1, 40, 24);
	const material = new THREE.ShaderMaterial({
		name: 'VoxelSkyDome',
		vertexShader: SKY_VERTEX_SHADER,
		fragmentShader: SKY_FRAGMENT_SHADER,
		side: THREE.BackSide,
		depthWrite: false,
		depthTest: false,
		fog: false,
		uniforms: {
			uZenithColor: { value: new THREE.Color('#6ea3d2') },
			uHorizonColor: { value: new THREE.Color('#d8eef8') },
			uGroundColor: { value: new THREE.Color('#f6dcc3') },
			uGlowColor: { value: new THREE.Color('#ffe9bf') },
			uGlowDirection: { value: new THREE.Vector3(0.3, 0.9, 0.1).normalize() },
			uGlowFocus: { value: 110 },
			uGlowIntensity: { value: 0.95 },
			uHorizonSoftness: { value: 0.26 },
			uStarIntensity: { value: 0 }
		}
	}) as SkyMaterial;
	const skyCameraPosition = new THREE.Vector3();
	const skyDome = new THREE.Mesh(geometry, material);

	skyDome.name = 'SkyDome';
	skyDome.frustumCulled = false;
	skyDome.renderOrder = -1000;
	skyDome.scale.setScalar(420);
	skyDome.onBeforeRender = (_renderer, _scene, camera) => {
		skyCameraPosition.setFromMatrixPosition(camera.matrixWorld);
		skyDome.position.copy(skyCameraPosition);
	};

	return skyDome;
}

function applySkyPreset(bundle: SceneBundle, preset: ScenePreset): void {
	const skyUniforms = bundle.skyDome.material.uniforms;
	const glowDirection = new THREE.Vector3()
		.copy(bundle.sunLight.position)
		.sub(bundle.sunLight.target.position)
		.normalize();

	skyUniforms.uZenithColor.value.set(preset.skyZenithColor);
	skyUniforms.uHorizonColor.value.set(preset.skyHorizonColor);
	skyUniforms.uGroundColor.value.set(preset.skyGroundColor);
	skyUniforms.uGlowColor.value.set(preset.skyGlowColor);
	skyUniforms.uGlowDirection.value.copy(glowDirection);
	skyUniforms.uGlowFocus.value = preset.skyGlowFocus;
	skyUniforms.uGlowIntensity.value = preset.skyGlowIntensity;
	skyUniforms.uStarIntensity.value = preset.skyStarIntensity;
}
