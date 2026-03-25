export class InputState {
	private readonly element: HTMLElement;
	private readonly keys = new Set<string>();
	private readonly pressedKeys = new Set<string>();
	private readonly buttons = new Set<number>();
	private readonly pressedButtons = new Set<number>();
	private readonly releasedButtons = new Set<number>();
	private pointerLocked = false;
	private pointerLockSuppressed = false;
	private freeLookEnabled = false;
	private shiftDown = false;
	private mouseDx = 0;
	private mouseDy = 0;
	private lastConsumedMouseDx = 0;
	private lastConsumedMouseDy = 0;
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

	isShiftDown(): boolean {
		return this.shiftDown;
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
		this.lastConsumedMouseDx = delta.dx;
		this.lastConsumedMouseDy = delta.dy;
		this.mouseDx = 0;
		this.mouseDy = 0;
		return delta;
	}

	getLastMouseDelta(): { dx: number; dy: number } {
		return {
			dx: this.lastConsumedMouseDx,
			dy: this.lastConsumedMouseDy
		};
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

	canApplyMouseLook(): boolean {
		return this.pointerLocked || this.freeLookEnabled;
	}

	requestPointerLock(): void {
		if (this.pointerLockSuppressed) {
			return;
		}

		if ('requestPointerLock' in this.element) {
			void this.element.requestPointerLock();
		}
	}

	setPointerLockSuppressed(suppressed: boolean): void {
		this.pointerLockSuppressed = suppressed;
	}

	setFreeLookEnabled(enabled: boolean): void {
		if (this.freeLookEnabled === enabled) {
			return;
		}

		this.freeLookEnabled = enabled;

		if (!enabled && !this.pointerLocked) {
			this.mouseDx = 0;
			this.mouseDy = 0;
		}
	}

	exitPointerLock(): void {
		if (document.pointerLockElement === this.element) {
			document.exitPointerLock();
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
		if (
			event.code === 'Tab' ||
			(this.pointerLocked && event.code === 'Space') ||
			((event.ctrlKey || event.metaKey) && event.code === 'KeyZ')
		) {
			event.preventDefault();
		}

		if (!this.keys.has(event.code)) {
			this.pressedKeys.add(event.code);
		}

		this.keys.add(event.code);
		this.shiftDown = event.shiftKey || event.code === 'ShiftLeft' || event.code === 'ShiftRight';
	};

	private handleKeyUp = (event: KeyboardEvent): void => {
		this.keys.delete(event.code);
		this.shiftDown = event.shiftKey;
	};

	private handleMouseMove = (event: MouseEvent): void => {
		this.shiftDown = event.shiftKey;

		if (!this.pointerLocked && !(this.freeLookEnabled && this.isPointerOverElement(event))) {
			return;
		}

		this.mouseDx += event.movementX;
		this.mouseDy += event.movementY;
	};

	private handleMouseDown = (event: MouseEvent): void => {
		event.preventDefault();
		this.shiftDown = event.shiftKey;

		if (!this.pointerLocked) {
			if (this.pointerLockSuppressed) {
				this.buttons.add(event.button);
				this.pressedButtons.add(event.button);
				return;
			}

			this.requestPointerLock();
			return;
		}

		this.buttons.add(event.button);
		this.pressedButtons.add(event.button);
	};

	private handleMouseUp = (event: MouseEvent): void => {
		this.shiftDown = event.shiftKey;
		this.buttons.delete(event.button);
		this.releasedButtons.add(event.button);
	};

	private handleContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
	};

	private handleWheel = (event: WheelEvent): void => {
		this.shiftDown = event.shiftKey;

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
			this.lastConsumedMouseDx = 0;
			this.lastConsumedMouseDy = 0;
			this.buttons.clear();
			this.pressedButtons.clear();
			this.releasedButtons.clear();
			this.shiftDown = false;
		}
	};

	private handleBlur = (): void => {
		this.keys.clear();
		this.pressedKeys.clear();
		this.buttons.clear();
		this.pressedButtons.clear();
		this.releasedButtons.clear();
		this.shiftDown = false;
		this.mouseDx = 0;
		this.mouseDy = 0;
		this.lastConsumedMouseDx = 0;
		this.lastConsumedMouseDy = 0;
		this.wheelSteps = 0;
	};

	private isPointerOverElement(event: MouseEvent): boolean {
		const rect = this.element.getBoundingClientRect();

		return (
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom
		);
	}
}
