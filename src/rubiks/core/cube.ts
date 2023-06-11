import { Camera, Color, Group, Matrix4, Vector2, Vector3 } from "three";
import { setFinish } from "./statusbar";
import { getAngleBetweenTwoVector2, equalDirection } from "../util/math";
import { ndcToScreen } from "../util/transform";
import CubeData, { CubeElement } from "./cubeData";
import CubeState, { RotateDirection } from "./cubeState";
import { createSquare, SquareMesh } from "./square";

/**
 * Get the position of the size of 0.5 block in the square inside
 */
const getTemPos = (square: SquareMesh, squareSize: number) => {
    const moveVect = square.element.normal.clone().normalize().multiplyScalar(-0.5 * squareSize);
    const pos = square.element.pos.clone();

    return pos.add(moveVect);
};

export class Cube extends Group {
    private data: CubeData;
    public state!: CubeState;
    public get squares() {
        return this.children as SquareMesh[];
    }

    /**
     * Cube order
     */
    public get order() {
        return this.data.cubeOrder;
    }

    /**
     * Square size
     */
    public get squareSize() {
        return this.data.elementSize;
    }

    /**
     * Whether to complete
     */
    public get finish() {
        return this.state.validateFinish();
    }

    public constructor(order = 3) {
        super();

        this.data = new CubeData(order);

        this.createChildrenByData();

        this.rotateX(Math.PI * 0.25);
        this.rotateY(Math.PI * 0.25);
        setFinish(this.finish);
    }

    private createChildrenByData() {
        this.remove(...this.children);

        for (let i = 0; i < this.data.elements.length; i++) {
            const square = createSquare(new Color(this.data.elements[i].color), this.data.elements[i]);
            this.add(square);
        }

        this.state = new CubeState(this.squares);
    }

    /**
     * Rotate
     * @param mousePrePos The screen coordinates of the mouse before rotating
     * @param mouseCurPos At this time, the mouse screen coordinates
     * @param controlSquare Control block
     * @param camera camera
     * @param winSize Window size
     */
    public rotateOnePlane(mousePrePos: Vector2, mouseCurPos: Vector2, controlSquare: SquareMesh, camera: Camera, winSize: { w: number; h: number }) {
        if (mouseCurPos.distanceTo(mousePrePos) < 5) {
            return;
        }

        if (!this.squares.includes(controlSquare)) {
            return;
        }

        const screenDir = mouseCurPos.clone().sub(mousePrePos);
        if (screenDir.x === 0 && screenDir.y === 0) return;
        if (!this.state.inRotation) {
            const squareScreenPos = this.getSquareScreenPos(controlSquare, camera, winSize) as Vector2;

            const squareNormal = controlSquare.element.normal;
            const squarePos = controlSquare.element.pos;

            // and controlSquare On the same side Square
            const commonDirSquares = this.squares.filter((square) => square.element.normal.equals(squareNormal) && !square.element.pos.equals(squarePos));

            // square1 and sqaure2 Two of the same side in the vertical and vertical direction SquareMesh
            let square1: SquareMesh | undefined;
            let square2: SquareMesh | undefined;
            for (let i = 0; i < commonDirSquares.length; i++) {
                if (squareNormal.x !== 0) {
                    if (commonDirSquares[i].element.pos.y === squarePos.y) {
                        square1 = commonDirSquares[i];
                    }
                    if (commonDirSquares[i].element.pos.z === squarePos.z) {
                        square2 = commonDirSquares[i];
                    }
                } else if (squareNormal.y !== 0) {
                    if (commonDirSquares[i].element.pos.x === squarePos.x) {
                        square1 = commonDirSquares[i];
                    }
                    if (commonDirSquares[i].element.pos.z === squarePos.z) {
                        square2 = commonDirSquares[i];
                    }
                } else if (squareNormal.z !== 0) {
                    if (commonDirSquares[i].element.pos.x === squarePos.x) {
                        square1 = commonDirSquares[i];
                    }
                    if (commonDirSquares[i].element.pos.y === squarePos.y) {
                        square2 = commonDirSquares[i];
                    }
                }

                if (square1 && square2) {
                    break;
                }
            }

            if (!square1 || !square2) {
                return;
            }

            const square1ScreenPos = this.getSquareScreenPos(square1, camera, winSize) as Vector2;
            const square2ScreenPos = this.getSquareScreenPos(square2, camera, winSize) as Vector2;

            // Four directions that may rotate
            const squareDirs: RotateDirection[] = [];

            const squareDir1 = {
                screenDir: new Vector2(square1ScreenPos.x - squareScreenPos.x, square1ScreenPos.y - squareScreenPos.y).normalize(),
                startSquare: controlSquare,
                endSquare: square1
            };
            const squareDir2 = {
                screenDir: new Vector2(square2ScreenPos.x - squareScreenPos.x, square2ScreenPos.y - squareScreenPos.y).normalize(),
                startSquare: controlSquare,
                endSquare: square2
            };
            squareDirs.push(squareDir1);
            squareDirs.push({
                screenDir: squareDir1.screenDir.clone().negate(),
                startSquare: square1,
                endSquare: controlSquare
            });
            squareDirs.push(squareDir2);
            squareDirs.push({
                screenDir: squareDir2.screenDir.clone().negate(),
                startSquare: square2,
                endSquare: controlSquare
            });

            // Determine the direction of rotating according to the angle of the four direction vectors that may rotate and the mouse translation direction.
            let minAngle = Math.abs(getAngleBetweenTwoVector2(squareDirs[0].screenDir, screenDir));
            let rotateDir = squareDirs[0];  // The final rotation direction

            for (let i = 0; i < squareDirs.length; i++) {
                const angle = Math.abs(getAngleBetweenTwoVector2(squareDirs[i].screenDir, screenDir));

                if (minAngle > angle) {
                    minAngle = angle;
                    rotateDir = squareDirs[i];
                }
            }

            // Rotating shaft: Fork accumulation calculation in the direction of the use vector and the direction of rotation
            const rotateDirLocal = rotateDir.endSquare.element.pos.clone().sub(rotateDir.startSquare.element.pos).normalize();
            const rotateAxisLocal = squareNormal.clone().cross(rotateDirLocal).normalize(); // Rotating shaft

            //Rotating squares: The vector of the position of the position of the block to rotate from the controlsquare position,
            // and the rotating shaft is vertical. Through this feature
            const rotateSquares: SquareMesh[] = [];
            const controlTemPos = getTemPos(controlSquare, this.data.elementSize);

            for (let i = 0; i < this.squares.length; i++) {
                const squareTemPos = getTemPos(this.squares[i], this.data.elementSize);
                const squareVec = controlTemPos.clone().sub(squareTemPos);
                if (squareVec.dot(rotateAxisLocal) === 0) {
                    rotateSquares.push(this.squares[i]);
                }
            }

            this.state.setRotating(controlSquare, rotateSquares, rotateDir, rotateAxisLocal);
        }

        const rotateSquares = this.state.activeSquares; // Rotating square
        const rotateAxisLocal = this.state.rotateAxisLocal; // Rotating shaft

        // The angle of rotation: use screenDirThe projection length in the rotation direction, the longer the projection length, the larger the rotation angle
        // The positive and negative value of the projection length affects the angle direction of Rubik's Cube rotation
        // The angle of the rotation = the length of the projection / the size of the cube * 90 degrees
        const temAngle = getAngleBetweenTwoVector2(this.state.rotateDirection!.screenDir, screenDir);
        const screenDirProjectRotateDirLen = Math.cos(temAngle) * screenDir.length();
        const coarseCubeSize = this.getCoarseCubeSize(camera, winSize);
        const rotateAnglePI = screenDirProjectRotateDirLen / coarseCubeSize * Math.PI * 0.5; // Rotation angle
        const newRotateAnglePI = rotateAnglePI - this.state.rotateAnglePI;
        this.state.rotateAnglePI = rotateAnglePI;

        const rotateMat = new Matrix4();
        rotateMat.makeRotationAxis(rotateAxisLocal!, newRotateAnglePI);

        for (let i = 0; i < rotateSquares.length; i++) {
            rotateSquares[i].applyMatrix4(rotateMat);
            rotateSquares[i].updateMatrix();
        }
    }

    /**
     * You need to update after rotating cube status
     */
    public getAfterRotateAnimation() {
        const needRotateAnglePI = this.getNeededRotateAngle();
        const rotateSpeed = Math.PI * 0.5 / 500; // 1s Rotate 90 degrees
        let rotatedAngle = 0;
        let lastTick: number;
        let rotateTick = (tick: number): boolean => {
            if (!lastTick) {
                lastTick = tick;
            }
            const time = tick - lastTick;
            lastTick = tick;
            if (rotatedAngle < Math.abs(needRotateAnglePI)) {
                let curAngle = time * rotateSpeed
                if (rotatedAngle + curAngle > Math.abs(needRotateAnglePI)) {
                    curAngle = Math.abs(needRotateAnglePI) - rotatedAngle;
                }
                rotatedAngle += curAngle;
                curAngle = needRotateAnglePI > 0 ? curAngle : -curAngle;

                const rotateMat = new Matrix4();
                rotateMat.makeRotationAxis(this.state.rotateAxisLocal!, curAngle);
                for (let i = 0; i < this.state.activeSquares.length; i++) {
                    this.state.activeSquares[i].applyMatrix4(rotateMat);
                    this.state.activeSquares[i].updateMatrix();
                }
                return true;
            } else {
                this.updateStateAfterRotate();
                this.data.saveDataToLocal();
                return false;
            }
        }

        return rotateTick;
    }

    /**
     * Update status after rotating
     */
    private updateStateAfterRotate() {
        // Rotate to the right position, sometimes it is not a multiples of 90 degrees, you need to modify the multiple of 90 degrees
        const needRotateAnglePI = this.getNeededRotateAngle();
        this.state.rotateAnglePI += needRotateAnglePI;

        // renew data：CubeElement The state, the method, the position, etc. after rotating changes
        const angleRelative360PI = this.state.rotateAnglePI % (Math.PI * 2);
        // const timesOfRight = angleRelative360PI / rightAnglePI; // The angle of rotation is equivalent to a few 90 degrees

        if (Math.abs(angleRelative360PI) > 0.1) {

            // Update location and French vector
            const rotateMat2 = new Matrix4();
            rotateMat2.makeRotationAxis(this.state.rotateAxisLocal!, angleRelative360PI);

            const pn: {
                nor: Vector3;
                pos: Vector3;
            }[] = [];

            for (let i = 0; i < this.state.activeSquares.length; i++) {
                const nor = this.state.activeSquares[i].element.normal.clone();
                const pos = this.state.activeSquares[i].element.pos.clone();

                nor.applyMatrix4(rotateMat2); // French vector after rotating
                pos.applyMatrix4(rotateMat2); // Rotating position

                // Find the box corresponding to the rotation and update its color
                for (let j = 0; j < this.state.activeSquares.length; j++) {
                    const nor2 = this.state.activeSquares[j].element.normal.clone();
                    const pos2 = this.state.activeSquares[j].element.pos.clone();
                    if (equalDirection(nor, nor2) && pos.distanceTo(pos2) < 0.1) {
                        pn.push({
                            nor: nor2,
                            pos: pos2
                        });
                    }
                }
            }

            for (let i = 0; i < this.state.activeSquares.length; i++) {
                this.state.activeSquares[i].element.normal = pn[i].nor;
                this.state.activeSquares[i].element.pos = pn[i].pos;
            }
        }

        this.state.resetState();
    }

    private getNeededRotateAngle() {
        const rightAnglePI = Math.PI * 0.5;
        const exceedAnglePI = Math.abs(this.state.rotateAnglePI) % rightAnglePI;
        let needRotateAnglePI = exceedAnglePI > rightAnglePI * 0.5 ? rightAnglePI - exceedAnglePI : -exceedAnglePI;
        needRotateAnglePI = this.state.rotateAnglePI > 0 ? needRotateAnglePI : -needRotateAnglePI;

        return needRotateAnglePI;
    }
    /**
     * Get a rough Rubik's Cube screen size
     */
    public getCoarseCubeSize(camera: Camera, winSize: { w: number; h: number }) {
        const width = this.order * this.squareSize;
        const p1 = new Vector3(-width / 2, 0, 0);
        const p2 = new Vector3(width / 2, 0, 0);

        p1.project(camera);
        p2.project(camera);

        const { w, h } = winSize;
        const screenP1 = ndcToScreen(p1, w, h);
        const screenP2 = ndcToScreen(p2, w, h);

        return Math.abs(screenP2.x - screenP1.x);
    }

    /**
     * get Square Standard screen coordinates
     */
    private getSquareScreenPos(square: SquareMesh, camera: Camera, winSize: { w: number; h: number }) {
        if (!this.squares.includes(square)) {
            return null;
        }

        const mat = new Matrix4().multiply(square.matrixWorld).multiply(this.matrix);

        const pos = new Vector3().applyMatrix4(mat);
        pos.project(camera);

        const { w, h } = winSize;
        return ndcToScreen(pos, w, h);
    }

    /**
     * upset
     */
    public disorder() {

    }

    public restore() {
        this.data.initialFinishData();
        this.data.saveDataToLocal();
        this.createChildrenByData();
        setFinish(this.finish);
    }
};
