import * as THREE from 'https://esm.sh/three@0.160.0';

export class SceneSetup {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.width = canvasContainer.clientWidth || window.innerWidth;
    this.height = canvasContainer.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0f14);
    this.scene.fog = new THREE.FogExp2(0x0c0f14, 0.045);

    this.setupCamera();
    this.setupRenderer();
    this.setupLights();
    this.setupEnvironment();
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 100);
    this.camera.position.set(6.8, 5.2, 7.8);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);
  }

  setupLights() {
    // Luz ambiental suave azulada
    const ambientLight = new THREE.AmbientLight(0x2a3848, 1.2);
    this.scene.add(ambientLight);

    // Luz principal cenital con sombras
    const mainLight = new THREE.DirectionalLight(0xffffff, 2.4);
    mainLight.position.set(5, 8, 4);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 25;
    mainLight.shadow.camera.left = -5;
    mainLight.shadow.camera.right = 5;
    mainLight.shadow.camera.top = 5;
    mainLight.shadow.camera.bottom = -5;
    mainLight.shadow.bias = -0.0005;
    this.scene.add(mainLight);

    // Luz de relleno lateral (Rim light color cian)
    const rimLight = new THREE.DirectionalLight(0x00d2ff, 1.4);
    rimLight.position.set(-6, 3, -4);
    this.scene.add(rimLight);

    // Luz de contraste naranja cálido
    const warmLight = new THREE.PointLight(0xff6b00, 1.8, 12);
    warmLight.position.set(3, 2, -3);
    this.scene.add(warmLight);
  }

  setupEnvironment() {
    // Suelo reflectante estilo celda de manufactura de alta tecnología
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x12161f,
      roughness: 0.45,
      metalness: 0.6
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Rejilla mecatrónica de referencia milimétrica / métrica
    const gridHelper = new THREE.GridHelper(20, 40, 0x00d2ff, 0x1f2d3d);
    gridHelper.position.y = 0.005;
    this.scene.add(gridHelper);

    // Pedestal del robot
    const pedestalGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.15, 32);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x1a212b,
      metalness: 0.9,
      roughness: 0.3
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = 0.075;
    pedestal.receiveShadow = true;
    pedestal.castShadow = true;
    this.scene.add(pedestal);
  }

  onResize() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
