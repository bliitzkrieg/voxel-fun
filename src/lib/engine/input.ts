export class InputState {
	private readonly element: HTMLElement;
	private readonly keys = new Set<string>();
	private readonly pressedKeys = new Set<string>();
	private readonly releasedKeys = new Set<string>();
	private readonly keyDownStartedAt = new Map<string, number>();
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
	private keyboardLockActive = false;
	private controlTapPending = false;
	private controlTapTriggered = false;

	constructor(element: HTMLElement) {
		this.element = element;
		this.element.tabIndex = this.element.tabIndex >= 0 ? this.element.tabIndex : 0;

		window.addEventListener('keydown', this.handleKeyDown, true);
		window.addEventListener('keyup', this.handleKeyUp, true);
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

	consumeKeyRelease(code: string): boolean {
		const wasReleased = this.releasedKeys.has(code);

		if (wasReleased) {
			this.releasedKeys.delete(code);
		}

		return wasReleased;
	}

	getKeyHoldDuration(code: string): number {
		if (!this.keys.has(code)) {
			return 0;
		}

		return performance.now() - (this.keyDownStartedAt.get(code) ?? performance.now());
	}

	consumeControlTap(): boolean {
		const wasTriggered = this.controlTapTriggered;
		this.controlTapTriggered = false;
		return wasTriggered;
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
		this.releaseKeyboardLock();
		window.removeEventListener('keydown', this.handleKeyDown, true);
		window.removeEventListener('keyup', this.handleKeyUp, true);
		window.removeEventListener('blur', this.handleBlur);
		window.removeEventListener('mouseup', this.handleMouseUp);
		window.removeEventListener('wheel', this.handleWheel);
		document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
		document.removeEventListener('mousemove', this.handleMouseMove);
		this.element.removeEventListener('mousedown', this.handleMouseDown);
		this.element.removeEventListener('contextmenu', this.handleContextMenu);
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (this.shouldPreventDefaultKeyAction(event)) {
			event.preventDefault();
			event.stopPropagation();
		}

		if (isControlKey(event.code)) {
			if (!this.isControlDown()) {
				this.controlTapPending = true;
			}
		} else if (this.controlTapPending && this.isControlDown()) {
			this.controlTapPending = false;
		}

		if (!this.keys.has(event.code)) {
			this.pressedKeys.add(event.code);
			this.keyDownStartedAt.set(event.code, performance.now());
		}

		this.keys.add(event.code);
		this.shiftDown = event.shiftKey || event.code === 'ShiftLeft' || event.code === 'ShiftRight';
	};

	private handleKeyUp = (event: KeyboardEvent): void => {
		const wasDown = this.keys.delete(event.code);
		this.keyDownStartedAt.delete(event.code);
		if (wasDown) {
			this.releasedKeys.add(event.code);
		}
		this.shiftDown = event.shiftKey;

		if (isControlKey(event.code) && !this.isControlDown()) {
			if (this.controlTapPending) {
				this.controlTapTriggered = true;
			}

			this.controlTapPending = false;
		}
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
		this.focusElement();
		this.requestKeyboardLock();
		if (this.controlTapPending && this.isControlDown()) {
			this.controlTapPending = false;
		}

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

		if (this.pointerLocked) {
			this.focusElement();
			this.requestKeyboardLock();
		}

		if (!this.pointerLocked) {
			this.releaseKeyboardLock();
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
		this.releaseKeyboardLock();
		this.keys.clear();
		this.pressedKeys.clear();
		this.releasedKeys.clear();
		this.keyDownStartedAt.clear();
		this.buttons.clear();
		this.pressedButtons.clear();
		this.releasedButtons.clear();
		this.shiftDown = false;
		this.controlTapPending = false;
		this.controlTapTriggered = false;
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

	private shouldPreventDefaultKeyAction(event: KeyboardEvent): boolean {
		if (event.code === 'Tab') {
			return true;
		}

		if (this.isKeyboardCaptured() && event.code === 'F1') {
			return true;
		}

		if (this.pointerLocked && event.code === 'Space') {
			return true;
		}

		if (
			this.isKeyboardCaptured() &&
			(event.code === 'ControlLeft' || event.code === 'ControlRight')
		) {
			return true;
		}

		if ((event.ctrlKey || event.metaKey) && this.shouldCaptureBrowserShortcut(event)) {
			return true;
		}

		return false;
	}

	private shouldCaptureBrowserShortcut(event: KeyboardEvent): boolean {
		if (!this.isKeyboardCaptured()) {
			return false;
		}

		const target = event.target instanceof Element ? event.target : null;

		return !isTextInputElement(target) && !isTextInputElement(document.activeElement);
	}

	private isKeyboardCaptured(): boolean {
		return this.pointerLocked || document.activeElement === this.element;
	}

	private isControlDown(): boolean {
		return this.keys.has('ControlLeft') || this.keys.has('ControlRight');
	}

	private focusElement(): void {
		this.element.focus({ preventScroll: true });
	}

	private requestKeyboardLock(): void {
		if (!this.isKeyboardCaptured() || this.keyboardLockActive) {
			return;
		}

		const keyboardApi = getKeyboardLockApi();

		if (!keyboardApi) {
			return;
		}

		void keyboardApi
			.lock()
			.then(() => {
				this.keyboardLockActive = true;
			})
			.catch(() => {
				this.keyboardLockActive = false;
			});
	}

	private releaseKeyboardLock(): void {
		if (!this.keyboardLockActive) {
			return;
		}

		getKeyboardLockApi()?.unlock();
		this.keyboardLockActive = false;
	}
}

function isTextInputElement(element: Element | null): boolean {
	return (
		element instanceof HTMLInputElement ||
		element instanceof HTMLTextAreaElement ||
		element instanceof HTMLSelectElement
	);
}

function isControlKey(code: string): boolean {
	return code === 'ControlLeft' || code === 'ControlRight';
}

interface KeyboardLockApi {
	lock(keys?: string[]): Promise<void>;
	unlock(): void;
}

function getKeyboardLockApi(): KeyboardLockApi | null {
	const keyboard = (navigator as Navigator & { keyboard?: KeyboardLockApi }).keyboard;
	return keyboard && typeof keyboard.lock === 'function' && typeof keyboard.unlock === 'function'
		? keyboard
		: null;
}
