import * as THREE from 'three';

export interface SceneBundle {
	scene: THREE.Scene;
	ambientLight: THREE.AmbientLight;
	directionalLight: THREE.DirectionalLight;
}

export function createGameScene(): SceneBundle {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color('#c9d0cf');

	const ambientLight = new THREE.AmbientLight(0xffffff, 0.38);
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.95);
	directionalLight.position.set(12, 20, 8);

	scene.add(ambientLight, directionalLight);

	return {
		scene,
		ambientLight,
		directionalLight
	};
}
