import * as THREE from 'three';

export interface SceneBundle {
	scene: THREE.Scene;
	ambientLight: THREE.AmbientLight;
	hemisphereLight: THREE.HemisphereLight;
	sunLight: THREE.DirectionalLight;
	fillLight: THREE.DirectionalLight;
}

export function createGameScene(): SceneBundle {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color('#bfd2d9');
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
	sunLight.shadow.mapSize.set(4096, 4096);
	sunLight.shadow.camera.near = 1;
	sunLight.shadow.camera.far = 72;
	sunLight.shadow.camera.left = -30;
	sunLight.shadow.camera.right = 30;
	sunLight.shadow.camera.top = 30;
	sunLight.shadow.camera.bottom = -30;
	sunLight.shadow.bias = -0.00015;
	sunLight.shadow.normalBias = 0.035;
	sunLight.shadow.radius = 2.4;
	sunLight.shadow.blurSamples = 10;

	fillLight.position.set(-18, 14, -22);

	scene.add(ambientLight, hemisphereLight, sunLight, fillLight, sunTarget);

	return {
		scene,
		ambientLight,
		hemisphereLight,
		sunLight,
		fillLight
	};
}
