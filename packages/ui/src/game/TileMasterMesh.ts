import { Scene, MeshBuilder, StandardMaterial, Color3, Mesh, Vector3, Quaternion, Texture, InstancedMesh } from '@babylonjs/core';
import { TILE_CONFIG } from '@blockgame/shared';

/**
 * Master mesh manager for Tile Instancing (Multi-Material approach)
 * Manages a set of master meshes, one for each unique texture.
 */
export class TileMasterMesh {
    private static instance: TileMasterMesh | null = null;
    private masters: Map<string, Mesh> = new Map();
    private scene: Scene;

    private constructor(scene: Scene) {
        this.scene = scene;
    }

    public static getInstance(scene?: Scene): TileMasterMesh {
        if (!TileMasterMesh.instance) {
            if (!scene) {
                throw new Error("Scene is required to initialize TileMasterMesh");
            }
            TileMasterMesh.instance = new TileMasterMesh(scene);
        }
        return TileMasterMesh.instance;
    }

    /**
     * Creates an instance of a tile with the specified texture.
     * If a master mesh for this texture doesn't exist, it is created.
     */
    public createInstance(textureUrl: string): InstancedMesh {
        const master = this.getOrCreateMaster(textureUrl);
        // Create instance
        // We use a generic name, the TileRenderer will manage the specific name if needed
        const instance = master.createInstance("tile_instance");
        // Ensure the instance is visible (masters are hidden)
        instance.isVisible = true;
        return instance;
    }

    private getOrCreateMaster(textureUrl: string): Mesh {
        if (this.masters.has(textureUrl)) {
            return this.masters.get(textureUrl)!;
        }

        // Create new master mesh
        const tileDimensions = TILE_CONFIG.meshSize;
        const masterMesh = MeshBuilder.CreateBox(
            `tile_master_${textureUrl}`,
            {
                width: tileDimensions.width,
                height: tileDimensions.height,
                depth: tileDimensions.depth,
            },
            this.scene
        );

        // Create material with improved light sensitivity
        const material = new StandardMaterial(`tile_mat_${textureUrl}`, this.scene);
        const texture = new Texture(textureUrl, this.scene, undefined, undefined, Texture.TRILINEAR_SAMPLINGMODE);

        material.diffuseTexture = texture;
        material.diffuseColor = new Color3(1.5, 1.5, 1.5); // Brighter diffuse for better light response
        material.ambientColor = new Color3(0.6, 0.6, 0.6); // Respond to ambient light
        material.specularColor = new Color3(0.4, 0.4, 0.4); // More specular for highlights
        material.specularPower = 16; // Lower power = wider highlights
        material.emissiveColor = new Color3(0.05, 0.05, 0.05); // Subtle self-illumination
        material.useSpecularOverAlpha = true; // Handle transparency if png

        masterMesh.material = material;

        // Enable shadow receiving for the master (applies to all instances)
        masterMesh.receiveShadows = true;

        // Hide master
        masterMesh.isVisible = false;

        // Store in map
        this.masters.set(textureUrl, masterMesh);

        return masterMesh;
    }

    public dispose() {
        this.masters.forEach(mesh => {
            mesh.material?.dispose();
            mesh.dispose();
        });
        this.masters.clear();
        TileMasterMesh.instance = null;
    }
}
