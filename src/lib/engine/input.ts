export class InputState {
	private readonly element: HTMLElement;
	private readonly keys = new Set<string>();
	private readonly pressedKeys = new Set<string>();
	private readonly buttons = new Set<number>();
	private readonly pressedButtons = new Set<number>();
	private readonly releasedButtons = new Set<number>();
	private pointerLocked = false;
	private mouseDx = 0;
	private mouseDy = 0;
	private wheelSteps = 0;

	constructor(element: HTMLElement) {
		this.element = element;
		this.element.tabIndex = this.element.tabIndex >= 0 ? this.element.tabIndex : 0;

		window.addEventListener('keydown', this.handleKeyDown);
		window.addEventListener('keyup', this.handleKeyUp);
		window.addEventListener('blur', this.handleBlur);
		window.addEventListener('mouseup', this.handleMouseUp);
		window.addEventListener('wheel', this.handleWheel, { passive: false });
		document.addEventListener('pointerlockchange', this.handlePointerLockChange);
		document.addEventListener('mousemove', this.handleMouseMove);
		this.element.addEventListener('mousedown', this.handleMouseDown);
		this.element.addEventListener('contextmenu', this.handleContextMenu);
	}

	isKeyDown(code: string): boolean {
		return this.keys.has(code);
	}

	consumeKeyPress(code: string): boolean {
		const wasPressed = this.pressedKeys.has(code);

		if (wasPressed) {
			this.pressedKeys.delete(code);
		}

		return wasPressed;
	}

	consumeMouseDelta(): { dx: number; dy: number } {
		const delta = { dx: this.mouseDx, dy: this.mouseDy };
		this.mouseDx = 0;
		this.mouseDy = 0;
		return delta;
	}

	consumeButtonPress(button: number): boolean {
		const wasPressed = this.pressedButtons.has(button);

		if (wasPressed) {
			this.pressedButtons.delete(button);
		}

		return wasPressed;
	}

	consumeButtonRelease(button: number): boolean {
		const wasReleased = this.releasedButtons.has(button);

		if (wasReleased) {
			this.releasedButtons.delete(button);
		}

		return wasReleased;
	}

	isButtonDown(button: number): boolean {
		return this.buttons.has(button);
	}

	consumeWheelSteps(): number {
		const steps = this.wheelSteps;
		this.wheelSteps = 0;
		return steps;
	}

	isPointerLocked(): boolean {
		return this.pointerLocked;
	}

	requestPointerLock(): void {
		if ('requestPointerLock' in this.element) {
			void this.element.requestPointerLock();
		}
	}

	dispose(): void {
		window.removeEventListener('keydown', this.handleKeyDown);
		window.removeEventListener('keyup', this.handleKeyUp);
		window.removeEventListener('blur', this.handleBlur);
		window.removeEventListener('mouseup', this.handleMouseUp);
		window.removeEventListener('wheel', this.handleWheel);
		document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
		document.removeEventListener('mousemove', this.handleMouseMove);
		this.element.removeEventListener('mousedown', this.handleMouseDown);
		this.element.removeEventListener('contextmenu', this.handleContextMenu);
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (event.code === 'Tab' || (this.pointerLocked && event.code === 'Space')) {
			event.preventDefault();
		}

		if (!this.keys.has(event.code)) {
			this.pressedKeys.add(event.code);
		}

		this.keys.add(event.code);
	};

	private handleKeyUp = (event: KeyboardEvent): void => {
		this.keys.delete(event.code);
	};

	private handleMouseMove = (event: MouseEvent): void => {
		if (!this.pointerLocked) {
			return;
		}

		this.mouseDx += event.movementX;
		this.mouseDy += event.movementY;
	};

	private handleMouseDown = (event: MouseEvent): void => {
		event.preventDefault();

		if (!this.pointerLocked) {
			this.requestPointerLock();
			return;
		}

		this.buttons.add(event.button);
		this.pressedButtons.add(event.button);
	};

	private handleMouseUp = (event: MouseEvent): void => {
		this.buttons.delete(event.button);
		this.releasedButtons.add(event.button);
	};

	private handleContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
	};

	private handleWheel = (event: WheelEvent): void => {
		if (!this.pointerLocked) {
			return;
		}

		event.preventDefault();
		this.wheelSteps += Math.sign(event.deltaY);
	};

	private handlePointerLockChange = (): void => {
		this.pointerLocked = document.pointerLockElement === this.element;

		if (!this.pointerLocked) {
			this.mouseDx = 0;
			this.mouseDy = 0;
			this.buttons.clear();
			this.pressedButtons.clear();
			this.releasedButtons.clear();
		}
	};

	private handleBlur = (): void => {
		this.keys.clear();
		this.pressedKeys.clear();
		this.buttons.clear();
		this.pressedButtons.clear();
		this.releasedButtons.clear();
		this.mouseDx = 0;
		this.mouseDy = 0;
		this.wheelSteps = 0;
	};
}
