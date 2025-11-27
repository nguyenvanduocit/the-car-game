import { Scene, MeshBuilder, StandardMaterial, Color3, Mesh, Vector3, Texture } from '@babylonjs/core';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { FLOOR_CONFIG } from '@blockgame/shared';

/**
 * Game floor rendering (100x200 units)
 * Provides visual reference for player movement boundaries
 *
 * NO CLIENT-SIDE PHYSICS:
 * - Server handles all physics (ground plane, collisions)
 * - Client only renders the visual floor mesh
 */
export class Floor {
  private scene: Scene;
  private mesh: Mesh;
  private boundaryMarkers: Mesh[] = [];
  private helpBillboards: Mesh[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
    this.mesh = this.createFloor();
    this.createBoundaryMarkers();
    this.createHelpBillboards();

    // Enable shadow receiving on floor
    this.mesh.receiveShadows = true;
  }

  /**
   * Create floor mesh with PBR material
   */
  private createFloor(): Mesh {
    // Create ground plane using shared dimensions
    const floor = MeshBuilder.CreateGround(
      'floor',
      {
        width: FLOOR_CONFIG.width,
        height: FLOOR_CONFIG.length,
      },
      this.scene
    );

    floor.position.y = FLOOR_CONFIG.y;

    // Create PBR material with metal plates texture
    const material = new PBRMaterial('floorMaterial', this.scene);

    // Texture tiling - repeat across the large floor
    const tilingU = FLOOR_CONFIG.width / 10; // 10 units per tile
    const tilingV = FLOOR_CONFIG.length / 10;

    // Albedo (color) texture - WebP for smaller file size
    const albedo = new Texture('/textures/floor/MetalPlates006_1K-PNG_Color.webp', this.scene);
    albedo.uScale = tilingU;
    albedo.vScale = tilingV;
    material.albedoTexture = albedo;

    // Normal map (GL version for BabylonJS)
    const normal = new Texture('/textures/floor/MetalPlates006_1K-PNG_NormalGL.webp', this.scene);
    normal.uScale = tilingU;
    normal.vScale = tilingV;
    material.bumpTexture = normal;

    // Reduce metallic so it doesn't reflect dark sky, increase roughness
    material.metallic = 0.3;
    material.roughness = 0.6;

    // Add subtle emissive for futuristic glow
    material.emissiveColor = new Color3(0.1, 0.1, 0.15);

    // Environment reflections from HDR skybox
    material.environmentIntensity = 0.8;

    // Performance: disable realtime filtering on floor (static surface)
    material.realTimeFiltering = false;

    floor.material = material;

    console.log('[FLOOR] PBR material created with metal plates texture');

    return floor;
  }

  /**
   * Create visual boundary markers at floor edges
   * Shows player movement limits (-50 to 50 x, -100 to 100 z)
   */
  private createBoundaryMarkers(): void {
    const markerMaterial = new StandardMaterial('boundaryMarkerMaterial', this.scene);
    markerMaterial.diffuseColor = new Color3(1, 0.3, 0.9); // Bright neon magenta
    markerMaterial.emissiveColor = new Color3(0.8, 0.2, 0.7); // Strong emissive glow

    // Floor dimensions
    const halfWidth = FLOOR_CONFIG.width / 2;
    const halfLength = FLOOR_CONFIG.length / 2;
    const markerConfig = FLOOR_CONFIG.boundaryMarkers;

    // Create edge lines (thin boxes) for visual boundaries - neon magenta
    const edgeMaterial = new StandardMaterial('boundaryEdgeMaterial', this.scene);
    edgeMaterial.diffuseColor = new Color3(1, 0.3, 0.9); // Bright neon magenta
    edgeMaterial.emissiveColor = new Color3(0.6, 0.15, 0.55); // Strong emissive
    edgeMaterial.alpha = 0.6; // Semi-transparent

    // Top edge (z = -100)
    const topEdge = MeshBuilder.CreateBox(
      'boundaryEdge_top',
      { width: FLOOR_CONFIG.width, height: markerConfig.edgeHeight, depth: markerConfig.edgeThickness },
      this.scene
    );
    topEdge.position = new Vector3(0, markerConfig.edgeHeight / 2, -halfLength);
    topEdge.material = edgeMaterial;
    this.boundaryMarkers.push(topEdge);

    // Bottom edge (z = 100)
    const bottomEdge = MeshBuilder.CreateBox(
      'boundaryEdge_bottom',
      { width: FLOOR_CONFIG.width, height: markerConfig.edgeHeight, depth: markerConfig.edgeThickness },
      this.scene
    );
    bottomEdge.position = new Vector3(0, markerConfig.edgeHeight / 2, halfLength);
    bottomEdge.material = edgeMaterial;
    this.boundaryMarkers.push(bottomEdge);

    // Left edge (x = -50)
    const leftEdge = MeshBuilder.CreateBox(
      'boundaryEdge_left',
      { width: markerConfig.edgeThickness, height: markerConfig.edgeHeight, depth: FLOOR_CONFIG.length },
      this.scene
    );
    leftEdge.position = new Vector3(-halfWidth, markerConfig.edgeHeight / 2, 0);
    leftEdge.material = edgeMaterial;
    this.boundaryMarkers.push(leftEdge);

    // Right edge (x = 50)
    const rightEdge = MeshBuilder.CreateBox(
      'boundaryEdge_right',
      { width: markerConfig.edgeThickness, height: markerConfig.edgeHeight, depth: FLOOR_CONFIG.length },
      this.scene
    );
    rightEdge.position = new Vector3(halfWidth, markerConfig.edgeHeight / 2, 0);
    rightEdge.material = edgeMaterial;
    this.boundaryMarkers.push(rightEdge);

    console.log('[FLOOR] Boundary markers created');
  }

  /**
   * Create help billboards at the floor border
   * Shows gameplay and help images as standing planes
   */
  private createHelpBillboards(): void {
    const halfWidth = FLOOR_CONFIG.width / 2;
    const billboardX = -halfWidth; // 5 units from left wall (west side)
    const billboardY = 4; // Center height
    const billboardWidth = 10;
    const billboardHeight = 6.8; // Maintain ~1.47:1 aspect ratio (680:462)
    const spacing = 10; // Space between the two billboards along Z
    const baseZ = -30; // Away from center ramp

    // Gameplay billboard (front)
    const gameplayPlane = MeshBuilder.CreatePlane(
      'helpBillboard_gameplay',
      { width: billboardWidth, height: billboardHeight },
      this.scene
    );
    gameplayPlane.position = new Vector3(billboardX, billboardY, baseZ - spacing / 2);
    // Rotate -90° around Y to face +X with correct texture orientation
    gameplayPlane.rotation.y = -Math.PI / 2;

    const gameplayMaterial = new StandardMaterial('gameplayBillboardMat', this.scene);
    gameplayMaterial.diffuseTexture = new Texture('/gameplay.webp', this.scene);
    gameplayMaterial.emissiveTexture = new Texture('/gameplay.webp', this.scene);
    gameplayMaterial.emissiveColor = new Color3(0.5, 0.5, 0.5); // Slight self-illumination
    gameplayMaterial.specularColor = new Color3(0, 0, 0); // No specular
    gameplayMaterial.backFaceCulling = false;
    gameplayPlane.material = gameplayMaterial;
    gameplayPlane.isPickable = false;
    this.helpBillboards.push(gameplayPlane);

    // Help billboard (back)
    const helpPlane = MeshBuilder.CreatePlane(
      'helpBillboard_help',
      { width: billboardWidth, height: billboardHeight },
      this.scene
    );
    helpPlane.position = new Vector3(billboardX, billboardY, baseZ + spacing / 2);
    helpPlane.rotation.y = -Math.PI / 2;

    const helpMaterial = new StandardMaterial('helpBillboardMat', this.scene);
    helpMaterial.diffuseTexture = new Texture('/help.webp', this.scene);
    helpMaterial.emissiveTexture = new Texture('/help.webp', this.scene);
    helpMaterial.emissiveColor = new Color3(0.5, 0.5, 0.5);
    helpMaterial.specularColor = new Color3(0, 0, 0);
    helpMaterial.backFaceCulling = false;
    helpPlane.material = helpMaterial;
    helpPlane.isPickable = false;
    this.helpBillboards.push(helpPlane);

    console.log('[FLOOR] Help billboards created at x =', billboardX, 'z =', baseZ);
  }

  /**
   * Get floor mesh
   */
  getMesh(): Mesh {
    return this.mesh;
  }

  /**
   * Dispose floor
   */
  dispose(): void {
    this.boundaryMarkers.forEach((marker) => marker.dispose());
    this.helpBillboards.forEach((billboard) => billboard.dispose());
    this.mesh.dispose();
  }
}
