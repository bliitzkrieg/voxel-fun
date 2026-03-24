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
	scene.fog = new THREE.Fog('#bfd2d9', 34, 96);

	const ambientLight = new THREE.AmbientLight('#fff2db', 0.16);
	const hemisphereLight = new THREE.HemisphereLight('#dff4ff', '#9e9388', 0.72);
	const sunLight = new THREE.DirectionalLight('#fff3d6', 2.3);
	const fillLight = new THREE.DirectionalLight('#c9e6ff', 0.4);
	const sunTarget = new THREE.Object3D();

	sunLight.position.set(22, 34, 16);
	sunTarget.position.set(8, 0, 12);
	sunLight.target = sunTarget;
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.set(2048, 2048);
	sunLight.shadow.camera.near = 1;
	sunLight.shadow.camera.far = 72;
	sunLight.shadow.camera.left = -24;
	sunLight.shadow.camera.right = 24;
	sunLight.shadow.camera.top = 24;
	sunLight.shadow.camera.bottom = -24;
	sunLight.shadow.bias = -0.00015;
	sunLight.shadow.normalBias = 0.03;
	sunLight.shadow.radius = 1.8;
	sunLight.shadow.blurSamples = 6;

	fillLight.position.set(-18, 14, -22);

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
	background: '#bfd2d9',
	fog: '#bfd2d9',
	fogNear: 34,
	fogFar: 96,
	ambientColor: '#fff2db',
	ambientIntensity: 0.16,
	hemisphereSkyColor: '#dff4ff',
	hemisphereGroundColor: '#9e9388',
	hemisphereIntensity: 0.72,
	sunColor: '#fff3d6',
	sunIntensity: 2.3,
	fillColor: '#c9e6ff',
	fillIntensity: 0.4
} as const;

const NIGHT_PRESET = {
	background: '#08111c',
	fog: '#08111c',
	fogNear: 24,
	fogFar: 78,
	ambientColor: '#7ba7d8',
	ambientIntensity: 0.08,
	hemisphereSkyColor: '#355580',
	hemisphereGroundColor: '#06090f',
	hemisphereIntensity: 0.24,
	sunColor: '#97c5ff',
	sunIntensity: 0.34,
	fillColor: '#81bcff',
	fillIntensity: 0.72
} as const;
