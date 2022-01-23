class Dragger {
	constructor({canvas}) {
		this.canvas = canvas;
		this.dragging = false;
		this.dragStart = null;
		this.dragEnd = null;
		this.mousePos = [0, 0];

		this.onCanvasClick = () => {};
		this.onCanvasDrag = () => {};

		this.canvas.addEventListener('mousedown', event => {
			this.dragStart = getCanvasMousePos(event);

			this.dragging = this.onCanvasClick();
		});

		this.canvas.addEventListener('mousemove', event => {
			const canvasMousePos = getCanvasMousePos(event);
			this.mousePos = [canvasMousePos.x, canvasMousePos.y];

			if(this.dragging) {
				this.dragEnd = canvasMousePos;

				this.onCanvasDrag(this.dragging);

				this.dragStart = this.dragEnd;
			}
		});

		this.canvas.addEventListener('mouseup', event => {
			this.dragging = false;
		});
	}

	addDrag(point) {
		return [point[0] + (this.dragEnd.x - this.dragStart.x), point[1] + (this.dragEnd.y - this.dragStart.y)];
	}
}

function getCanvasMousePos(event) {
	const boundingRect = event.target.getBoundingClientRect();

	return {
		x: Math.floor((event.pageX - (boundingRect.left + window.scrollX)) * (event.target.width / boundingRect.width)),
		y: Math.floor((event.pageY - (boundingRect.top + window.scrollY)) * (event.target.height / boundingRect.height)),
	}
}