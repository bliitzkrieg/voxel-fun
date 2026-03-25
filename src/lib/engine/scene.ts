import * as THREE from 'three';

export type TimeOfDay = 'day' | 'night';

export interface SceneBundle {
	scene: THREE.Scene;
	ambientLight: THREE.AmbientLight;
	hemisphereLight: THREE.HemisphereLight;
	sunLight: THREE.DirectionalLight;
	fillLight: THREE.DirectionalLight;
	timeOfDay: TimeOfDay;
}

export function createGameScene(): SceneBundle {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color();
	scene.fog = new THREE.Fog('#c2cfd1', 22, 88);

	const ambientLight = new THREE.AmbientLight('#ffe7c5', 0.1);
	const hemisphereLight = new THREE.HemisphereLight('#d5e7ef', '#867c70', 0.62);
	const sunLight = new THREE.DirectionalLight('#ffe1bc', 2.05);
	const fillLight = new THREE.DirectionalLight('#bfd6e4', 0.52);
	const sunTarget = new THREE.Object3D();

	sunLight.position.set(26, 32, 12);
	sunTarget.position.set(10, 4, 14);
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

	scene.add(ambientLight, hemisphereLight, sunLight, fillLight, sunTarget);

	const bundle: SceneBundle = {
		scene,
		ambientLight,
		hemisphereLight,
		sunLight,
		fillLight,
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
	bundle.timeOfDay = timeOfDay;
}

const DAY_PRESET = {
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
	sunIntensity: 2.05,
	fillColor: '#bfd6e4',
	fillIntensity: 0.52
} as const;

const NIGHT_PRESET = {
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
	fillIntensity: 0.48
} as const;
