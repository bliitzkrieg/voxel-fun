export class FixedLoop {
	private readonly fixedDt = 1 / 60;
	private readonly maxFrameDt = 0.1;
	private animationFrame = 0;
	private accumulator = 0;
	private lastTime = 0;
	private running = false;

	constructor(
		private readonly onUpdate: (dt: number) => void,
		private readonly onRender: () => void
	) {}

	start(): void {
		if (this.running) {
			return;
		}

		this.running = true;
		this.accumulator = 0;
		this.lastTime = performance.now();
		this.animationFrame = window.requestAnimationFrame(this.handleFrame);
	}

	dispose(): void {
		this.running = false;

		if (this.animationFrame !== 0) {
			window.cancelAnimationFrame(this.animationFrame);
			this.animationFrame = 0;
		}
	}

	private handleFrame = (now: number): void => {
		if (!this.running) {
			return;
		}

		const frameDt = Math.min((now - this.lastTime) / 1000, this.maxFrameDt);
		this.lastTime = now;
		this.accumulator += frameDt;

		while (this.accumulator >= this.fixedDt) {
			this.onUpdate(this.fixedDt);
			this.accumulator -= this.fixedDt;
		}

		this.onRender();
		this.animationFrame = window.requestAnimationFrame(this.handleFrame);
	};
}
