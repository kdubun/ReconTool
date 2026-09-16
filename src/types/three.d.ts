declare module 'three' {
  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
  }

  export class EllipseCurve {
    constructor(
      aX: number,
      aY: number,
      xRadius: number,
      yRadius: number,
      aStartAngle: number,
      aEndAngle: number,
      aClockwise: boolean,
      aRotation: number,
    );
    getPoints(divisions: number): Array<{ x: number; y: number }>;
  }

  export class BufferGeometry {
    setFromPoints(points: Vector3[]): BufferGeometry;
    dispose(): void;
  }

  export class LineBasicMaterial {
    constructor(params?: {
      color?: number;
      transparent?: boolean;
      opacity?: number;
    });
    dispose(): void;
  }

  export class LineLoop extends Object3D {
    constructor(geometry: BufferGeometry, material: LineBasicMaterial);
    geometry: BufferGeometry;
    material: LineBasicMaterial;
  }

  export class GridHelper extends Object3D {
    constructor(size: number, divisions: number, color1?: number, color2?: number);
    position: { y: number };
  }

  export class Object3D {
    add(object: Object3D): this;
    remove(object: Object3D): this;
  }

  export class Scene extends Object3D {}
}
