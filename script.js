if (!window.THREE) { const fallback = document.createElement('script'); fallback.src = 'vendor/three.min.js'; fallback.onerror = () => { document.body.innerHTML = '<p style=\"color:#fff;font-family:sans-serif;padding:24px\">No se pudo cargar Three.js. Conecta a internet o agrega la librería en vendor/three.min.js.</p>'; }; document.head.appendChild(fallback); }


(() => {
  if (!window.THREE) {
    document.body.innerHTML = '<p style="color:#fff;font-family:sans-serif;padding:24px">No se encontró Three.js. Revisa que exista vendor/three.min.js.</p>';
    return;
  }

  const PLAYER_SPEED = 5.35;
  const ENEMY_SPEEDS = [3.2, 3.55, 3.9];
  const JUMP_V = 8.05;
  const GRAVITY = 26;
  const STUN_TIME = 10;
  const ROUND_TIME = 10 * 60;
  const STEP = 0.42;

  const LEVELS = [
    { animals: ['vaca', 'conejo', 'mariposa', 'caracol'] },
    { animals: ['tortuga', 'cerdo', 'rana', 'arana', 'abeja', 'cangrejo'] },
    { animals: ['vaca', 'conejo', 'tortuga', 'cerdo', 'mariposa', 'caracol', 'gusano', 'arana'] }
  ];

  const INFO = {
    vaca: { v: true, name: 'Vaca' },
    conejo: { v: true, name: 'Conejo' },
    tortuga: { v: true, name: 'Tortuga' },
    cerdo: { v: true, name: 'Cerdo' },
    rana: { v: true, name: 'Rana' },
    mariposa: { v: false, name: 'Mariposa' },
    caracol: { v: false, name: 'Caracol' },
    arana: { v: false, name: 'Araña' },
    abeja: { v: false, name: 'Abeja' },
    cangrejo: { v: false, name: 'Cangrejo' },
    gusano: { v: false, name: 'Gusano' }
  };

  const menuText = 'Lleva cada animal al corral correcto antes de que se acabe el tiempo.';

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x020508);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.touchAction = 'none';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020508);
  scene.fog = new THREE.Fog(0x020508, 18, 64);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 120);
  camera.position.set(0, 12, 14);

  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  scene.add(new THREE.HemisphereLight(0xfff4e5, 0x4a2020, 0.28));
  const sun = new THREE.DirectionalLight(0x7fe8ff, 0.18);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 0.5; sc.far = 50;
  sun.shadow.bias = -0.003;
  scene.add(sun);

  const neonGlow = new THREE.PointLight(0x66ffcc, 2.2, 42, 2);
  neonGlow.position.set(0, 8, 8);
  scene.add(neonGlow);

  const world = new THREE.Group();
  scene.add(world);

  // ---- Recursos compartidos (menos objetos nuevos por fotograma = más fluido) ----
  const _tmpV = new THREE.Vector3();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const bulletGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  const basicCache = new Map();
  function basicMat(hex) {
    if (!basicCache.has(hex)) basicCache.set(hex, new THREE.MeshBasicMaterial({ color: hex }));
    return basicCache.get(hex);
  }

  function makeGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const glowTex = makeGlowTexture();
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8 });
  const bulletGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd23f, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  // Estrellas lejanas alrededor de la isla
  const starField = (() => {
    const n = 420;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = 70 + Math.random() * 14;
      const k = Math.sqrt(1 - u * u);
      arr[i * 3] = Math.cos(a) * k * r;
      arr[i * 3 + 1] = u * r;
      arr[i * 3 + 2] = Math.sin(a) * k * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xa8dcff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false, fog: false
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    return pts;
  })();

  const EMOJI = {
    vaca: '🐮', conejo: '🐰', tortuga: '🐢', cerdo: '🐷', rana: '🐸', mariposa: '🦋',
    caracol: '🐌', arana: '🕷️', abeja: '🐝', cangrejo: '🦀', gusano: '🐛'
  };

  const matCache = new Map();
  function mat(color, opts) {
    const key = color + (opts ? JSON.stringify(opts) : '');
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
    matCache.set(key, m);
    return m;
  }

  function canvasTex(draw, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  const pigMat = new THREE.MeshLambertMaterial({
    map: canvasTex((g, w, h) => {
      g.fillStyle = '#f4c3bf';
      g.fillRect(0, 0, w, h);
      const tones = ['#e7a8a4', '#f7d4d0', '#d9898e', '#fbe4e1'];
      for (let i = 0; i < 70; i++) {
        g.fillStyle = tones[i % tones.length];
        g.fillRect((i * 5) % w, (i * 7) % h, 3, 3);
      }
    }, 32, 32)
  });

  const shellMat = new THREE.MeshLambertMaterial({
    map: canvasTex((g, w, h) => {
      g.fillStyle = '#d86a28';
      g.fillRect(0, 0, w, h);
      const tones = ['#c4511c', '#e8893a', '#a34416', '#f0a05a'];
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          g.fillStyle = tones[(x / 4 + y / 4) % tones.length | 0];
          g.fillRect(x, y, 4, 4);
        }
      }
    }, 32, 32)
  });

  function cube(parent, sx, sy, sz, color, x, y, z) {
    const material = color && color.isMaterial ? color : mat(color);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function makeFace(type) {
    const map = canvasTex((g) => {
      if (type === 'hero') {
        g.fillStyle = '#ffb13a';
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = '#1b1b1b';
        g.fillRect(14, 18, 10, 12);
        g.fillRect(40, 18, 10, 12);
        g.fillRect(18, 40, 4, 4);
        g.fillRect(42, 40, 4, 4);
        g.fillRect(22, 44, 20, 4);
        g.fillStyle = '#ff8d7a';
        g.fillRect(8, 36, 6, 4);
        g.fillRect(50, 36, 6, 4);
      } else {
        g.fillStyle = '#8e8e8e';
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = '#c0392b';
        g.fillRect(14, 18, 10, 12);
        g.fillRect(40, 18, 10, 12);
        g.fillStyle = '#222';
        g.fillRect(20, 46, 24, 4);
      }
    }, 64, 64);
    return new THREE.MeshBasicMaterial({ map });
  }

  // Letrero de neón sin fondo. Es un sprite: siempre mira hacia la cámara, es decir, hacia el jugador.
  function makeNeonSign(text, hex) {
    const W = 1024, H = 256;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const css = '#' + hex.toString(16).padStart(6, '0');
    const family = '"Fredoka", "Trebuchet MS", "Segoe UI", sans-serif';
    function draw() {
      g.clearRect(0, 0, W, H);
      let size = 128;
      g.font = '700 ' + size + 'px ' + family;
      const maxW = W - 170;
      const w = g.measureText(text).width;
      if (w > maxW) {
        size = Math.floor(size * maxW / w);
        g.font = '700 ' + size + 'px ' + family;
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      const cx = W / 2;
      const cy = H / 2 - 14;
      [[64, 24, 0.30], [34, 17, 0.55], [14, 11, 0.95]].forEach(([blur, lw, a]) => {
        g.shadowColor = css; g.shadowBlur = blur;
        g.strokeStyle = css; g.lineWidth = lw; g.globalAlpha = a;
        g.strokeText(text, cx, cy);
      });
      g.shadowBlur = 0; g.globalAlpha = 1;
      g.fillStyle = '#fdfdff';
      g.fillText(text, cx, cy);
      const ly = cy + size * 0.68;
      g.shadowColor = css; g.shadowBlur = 26; g.fillStyle = css; g.globalAlpha = 0.9;
      g.fillRect(W / 2 - 190, ly - 5, 380, 10);
      g.shadowBlur = 0; g.globalAlpha = 1; g.fillStyle = '#fdfdff';
      g.fillRect(W / 2 - 186, ly - 1.5, 372, 3);
    }
    draw();
    const map = new THREE.CanvasTexture(cv);
    if (THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const material = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    material.userData.unique = true;
    const sp = new THREE.Sprite(material);
    sp.scale.set(3.1, 0.775, 1);
    sp.userData.uniqueMap = map;
    sp.userData.redraw = () => { draw(); map.needsUpdate = true; };
    return sp;
  }

  function makeStarSprite() {
    const map = canvasTex((g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#ffe14a';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? 28 : 12;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const px = w / 2 + Math.cos(a) * rad;
        const py = h / 2 + Math.sin(a) * rad;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
    }, 64, 64);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true }));
    s.scale.set(0.38, 0.38, 1);
    s.userData.uniqueMap = map;
    return s;
  }

  function finishAnimal(g, kind) {
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const dy = -box.min.y;
    for (const ch of [...g.children]) ch.position.y += dy;
    const info = INFO[kind];
    g.userData.kind = kind;
    g.userData.vertebrate = info.v;
    g.userData.name = info.name;
    return g;
  }

  function makeCow() {
    const g = new THREE.Group();
    const W = 0xf7f7f7, K = 0x1a1a1a, P = 0xf3a3b0;
    [[-0.28, 0.16], [0.22, 0.16], [-0.28, -0.16], [0.22, -0.16]].forEach(([x, z]) => {
      cube(g, 0.14, 0.32, 0.14, W, x, 0.2, z);
      cube(g, 0.15, 0.08, 0.15, K, x, 0.04, z);
    });
    cube(g, 0.86, 0.42, 0.48, W, 0.02, 0.52, 0);
    cube(g, 0.3, 0.24, 0.08, K, 0.1, 0.62, 0.24);
    cube(g, 0.22, 0.16, 0.08, K, 0.16, 0.58, -0.24);
    cube(g, 0.22, 0.1, 0.34, K, 0.02, 0.76, 0);
    cube(g, 0.34, 0.32, 0.34, W, -0.52, 0.64, 0);
    cube(g, 0.2, 0.2, 0.26, P, -0.74, 0.56, 0);
    cube(g, 0.04, 0.06, 0.06, 0xc45b73, -0.84, 0.56, 0.06);
    cube(g, 0.04, 0.06, 0.06, 0xc45b73, -0.84, 0.56, -0.06);
    cube(g, 0.08, 0.12, 0.08, K, -0.46, 0.86, 0.1);
    cube(g, 0.08, 0.12, 0.08, K, -0.46, 0.86, -0.1);
    cube(g, 0.08, 0.14, 0.06, P, -0.4, 0.72, 0.2);
    cube(g, 0.08, 0.14, 0.06, P, -0.4, 0.72, -0.2);
    cube(g, 0.06, 0.08, 0.04, K, -0.66, 0.72, 0.12);
    cube(g, 0.06, 0.08, 0.04, K, -0.66, 0.72, -0.12);
    cube(g, 0.24, 0.12, 0.16, P, 0.14, 0.34, 0);
    cube(g, 0.06, 0.22, 0.06, K, 0.48, 0.6, 0);
    return finishAnimal(g, 'vaca');
  }

  function makeRabbit() {
    const g = new THREE.Group();
    const W = 0xffffff, P = 0xf7b7c4, K = 0x161616;
    cube(g, 0.7, 0.36, 0.42, W, -0.05, 0.34, 0);
    cube(g, 0.22, 0.16, 0.2, W, -0.36, 0.18, 0);
    cube(g, 0.16, 0.12, 0.16, W, 0.22, 0.14, 0.12);
    cube(g, 0.16, 0.12, 0.16, W, 0.22, 0.14, -0.12);
    cube(g, 0.36, 0.32, 0.34, W, 0.32, 0.46, 0);
    cube(g, 0.16, 0.14, 0.24, W, 0.5, 0.36, 0);
    cube(g, 0.1, 0.08, 0.12, P, 0.58, 0.36, 0);
    cube(g, 0.07, 0.1, 0.04, K, 0.42, 0.52, 0.08);
    cube(g, 0.07, 0.1, 0.04, K, 0.42, 0.52, -0.08);
    cube(g, 0.12, 0.5, 0.1, W, 0.26, 0.84, 0.08);
    cube(g, 0.12, 0.5, 0.1, W, 0.26, 0.84, -0.08);
    cube(g, 0.05, 0.38, 0.04, P, 0.26, 0.82, 0.1);
    cube(g, 0.05, 0.38, 0.04, P, 0.26, 0.82, -0.1);
    return finishAnimal(g, 'conejo');
  }

  function makeTurtle() {
    const g = new THREE.Group();
    cube(g, 0.72, 0.16, 0.52, 0xf3e2a0, 0, 0.2, 0);
    cube(g, 0.8, 0.28, 0.6, shellMat, 0, 0.4, 0);
    cube(g, 0.48, 0.16, 0.36, shellMat, 0, 0.58, 0);
    cube(g, 0.26, 0.22, 0.24, 0x8bd44a, 0.52, 0.28, 0);
    cube(g, 0.07, 0.08, 0.04, 0x111111, 0.62, 0.32, 0.07);
    cube(g, 0.16, 0.14, 0.18, 0x6fbf3a, 0.26, 0.1, 0.28);
    cube(g, 0.16, 0.14, 0.18, 0x6fbf3a, 0.26, 0.1, -0.28);
    cube(g, 0.16, 0.14, 0.18, 0x6fbf3a, -0.28, 0.1, 0.28);
    cube(g, 0.16, 0.14, 0.18, 0x6fbf3a, -0.28, 0.1, -0.28);
    cube(g, 0.12, 0.08, 0.1, 0x6fbf3a, -0.48, 0.16, 0);
    return finishAnimal(g, 'tortuga');
  }

  function makePig() {
    const g = new THREE.Group();
    cube(g, 0.78, 0.48, 0.5, pigMat, 0, 0.46, 0);
    cube(g, 0.28, 0.26, 0.26, pigMat, 0.5, 0.48, 0);
    cube(g, 0.16, 0.18, 0.22, 0xe56b6b, 0.68, 0.44, 0);
    cube(g, 0.04, 0.06, 0.05, 0xa1434d, 0.76, 0.46, 0.05);
    cube(g, 0.04, 0.06, 0.05, 0xa1434d, 0.76, 0.46, -0.05);
    cube(g, 0.08, 0.1, 0.04, 0x1a1a1a, 0.56, 0.56, 0.08);
    cube(g, 0.08, 0.1, 0.04, 0x1a1a1a, 0.56, 0.56, -0.08);
    cube(g, 0.12, 0.16, 0.08, 0xf0b2ad, 0.24, 0.78, 0.12);
    cube(g, 0.12, 0.16, 0.08, 0xf0b2ad, 0.24, 0.78, -0.12);
    cube(g, 0.08, 0.1, 0.04, 0xd36a72, 0.24, 0.78, 0.15);
    cube(g, 0.08, 0.1, 0.04, 0xd36a72, 0.24, 0.78, -0.15);
    [[0.2, 0.18], [0.2, -0.18], [-0.22, 0.18], [-0.22, -0.18]].forEach(([x, z]) => {
      cube(g, 0.14, 0.24, 0.14, pigMat, x, 0.16, z);
      cube(g, 0.15, 0.06, 0.15, 0xe07a84, x, 0.04, z);
    });
    return finishAnimal(g, 'cerdo');
  }

  function makeFrog() {
    const g = new THREE.Group();
    cube(g, 0.46, 0.24, 0.4, 0x67c23a, 0, 0.22, 0);
    cube(g, 0.28, 0.2, 0.28, 0x7ed14a, 0.28, 0.28, 0);
    cube(g, 0.12, 0.12, 0.12, 0xf4f4f4, 0.34, 0.4, 0.08);
    cube(g, 0.12, 0.12, 0.12, 0xf4f4f4, 0.34, 0.4, -0.08);
    cube(g, 0.06, 0.06, 0.04, 0x111111, 0.38, 0.4, 0.08);
    cube(g, 0.06, 0.06, 0.04, 0x111111, 0.38, 0.4, -0.08);
    cube(g, 0.22, 0.1, 0.16, 0x4e9a2c, -0.16, 0.12, 0.22);
    cube(g, 0.22, 0.1, 0.16, 0x4e9a2c, -0.16, 0.12, -0.22);
    cube(g, 0.14, 0.08, 0.12, 0x4e9a2c, 0.24, 0.1, 0.16);
    cube(g, 0.14, 0.08, 0.12, 0x4e9a2c, 0.24, 0.1, -0.16);
    return finishAnimal(g, 'rana');
  }

  function makeButterfly() {
    const g = new THREE.Group();
    cube(g, 0.12, 0.12, 0.46, 0x222222, 0, 0.28, 0);
    cube(g, 0.1, 0.1, 0.1, 0x111111, 0, 0.32, 0.26);
    cube(g, 0.34, 0.08, 0.28, 0xff5fa2, -0.22, 0.32, 0.08);
    cube(g, 0.34, 0.08, 0.28, 0x7a5cff, -0.22, 0.32, -0.16);
    cube(g, 0.34, 0.08, 0.28, 0xffe14a, 0.22, 0.32, 0.08);
    cube(g, 0.34, 0.08, 0.28, 0x49d0e0, 0.22, 0.32, -0.16);
    cube(g, 0.04, 0.16, 0.04, 0x222222, 0.04, 0.42, 0.32);
    cube(g, 0.04, 0.16, 0.04, 0x222222, -0.04, 0.42, 0.32);
    return finishAnimal(g, 'mariposa');
  }

  function makeSnail() {
    const g = new THREE.Group();
    cube(g, 0.55, 0.16, 0.28, 0xe6c48a, 0.05, 0.12, 0);
    cube(g, 0.16, 0.12, 0.2, 0xd7b07a, 0.36, 0.14, 0);
    cube(g, 0.04, 0.18, 0.04, 0xe6c48a, 0.4, 0.28, 0.06);
    cube(g, 0.04, 0.18, 0.04, 0xe6c48a, 0.4, 0.28, -0.06);
    cube(g, 0.06, 0.06, 0.06, 0x222222, 0.4, 0.38, 0.06);
    cube(g, 0.06, 0.06, 0.06, 0x222222, 0.4, 0.38, -0.06);
    cube(g, 0.32, 0.26, 0.32, 0x8a5a32, -0.08, 0.28, 0);
    cube(g, 0.22, 0.18, 0.22, 0xc48a52, -0.02, 0.42, 0);
    cube(g, 0.12, 0.12, 0.12, 0x6e4428, 0.02, 0.52, 0);
    return finishAnimal(g, 'caracol');
  }

  function makeSpider() {
    const g = new THREE.Group();
    cube(g, 0.32, 0.24, 0.32, 0x2a2a2a, 0.1, 0.22, 0);
    cube(g, 0.22, 0.16, 0.22, 0x3a3a3a, -0.16, 0.2, 0);
    cube(g, 0.05, 0.05, 0.04, 0xff3355, -0.24, 0.26, 0.06);
    cube(g, 0.05, 0.05, 0.04, 0xff3355, -0.24, 0.26, -0.06);
    for (let i = 0; i < 4; i++) {
      const z = -0.14 + i * 0.09;
      [-1, 1].forEach((s) => {
        const leg = cube(g, 0.34, 0.05, 0.05, 0x1a1a1a, s * 0.28, 0.16, z);
        leg.rotation.z = s * 0.45;
      });
    }
    return finishAnimal(g, 'arana');
  }

  function makeBee() {
    const g = new THREE.Group();
    cube(g, 0.22, 0.22, 0.22, 0x1a1a1a, -0.28, 0.24, 0);
    cube(g, 0.16, 0.22, 0.24, 0xf0c400, -0.08, 0.24, 0);
    cube(g, 0.16, 0.22, 0.24, 0x1a1a1a, 0.08, 0.24, 0);
    cube(g, 0.16, 0.22, 0.24, 0xf0c400, 0.24, 0.24, 0);
    const wing = mat(0xffffff, { transparent: true, opacity: 0.7 });
    cube(g, 0.26, 0.04, 0.16, wing, 0, 0.4, 0.16);
    cube(g, 0.26, 0.04, 0.16, wing, 0, 0.4, -0.16);
    cube(g, 0.04, 0.12, 0.04, 0x222222, 0.32, 0.36, 0.06);
    cube(g, 0.04, 0.12, 0.04, 0x222222, 0.32, 0.36, -0.06);
    return finishAnimal(g, 'abeja');
  }

  function makeCrab() {
    const g = new THREE.Group();
    cube(g, 0.62, 0.22, 0.42, 0xe24b3c, 0, 0.22, 0);
    cube(g, 0.16, 0.2, 0.16, 0xc4372e, -0.18, 0.28, 0.28);
    cube(g, 0.16, 0.2, 0.16, 0xc4372e, 0.18, 0.28, 0.28);
    cube(g, 0.18, 0.12, 0.12, 0xff6a52, -0.34, 0.24, 0.18);
    cube(g, 0.18, 0.12, 0.12, 0xff6a52, 0.34, 0.24, 0.18);
    cube(g, 0.05, 0.16, 0.05, 0x222222, -0.08, 0.4, 0.16);
    cube(g, 0.05, 0.16, 0.05, 0x222222, 0.08, 0.4, 0.16);
    cube(g, 0.07, 0.07, 0.07, 0xffffff, -0.08, 0.5, 0.16);
    cube(g, 0.07, 0.07, 0.07, 0xffffff, 0.08, 0.5, 0.16);
    cube(g, 0.04, 0.04, 0.04, 0x111111, -0.08, 0.5, 0.19);
    cube(g, 0.04, 0.04, 0.04, 0x111111, 0.08, 0.5, 0.19);
    [[-0.22, -0.2], [-0.05, -0.24], [0.12, -0.24], [0.26, -0.18]].forEach(([x, z]) => {
      cube(g, 0.08, 0.08, 0.12, 0xc4372e, x, 0.08, z);
    });
    return finishAnimal(g, 'cangrejo');
  }

  function makeWorm() {
    const g = new THREE.Group();
    const cols = [0xf2a3b5, 0xe8899f, 0xf6c0cc, 0xd96b86, 0xf2a3b5];
    for (let i = 0; i < 5; i++) {
      const s = 0.22 - i * 0.02;
      cube(g, s, s * 0.8, s, cols[i], -0.42 + i * 0.2, 0.12, Math.sin(i) * 0.04);
    }
    cube(g, 0.05, 0.05, 0.04, 0x222222, 0.42, 0.16, 0.04);
    cube(g, 0.05, 0.05, 0.04, 0x222222, 0.42, 0.16, -0.04);
    return finishAnimal(g, 'gusano');
  }

  const BUILDERS = {
    vaca: makeCow, conejo: makeRabbit, tortuga: makeTurtle, cerdo: makePig, rana: makeFrog,
    mariposa: makeButterfly, caracol: makeSnail, arana: makeSpider, abeja: makeBee,
    cangrejo: makeCrab, gusano: makeWorm
  };

  function makePerson(type) {
    const g = new THREE.Group();
    const hero = type === 'hero';
    const body = hero ? 0x2ec4c9 : 0x8d8d8d;
    const skin = hero ? 0xffb13a : 0x7a7a7a;
    const leg = hero ? 0x178f99 : 0x5e5e5e;
    const legL = new THREE.Group(); legL.position.set(-0.1, 0.32, 0); g.add(legL);
    const legR = new THREE.Group(); legR.position.set(0.1, 0.32, 0); g.add(legR);
    cube(legL, 0.16, 0.32, 0.16, leg, 0, -0.16, 0);
    cube(legR, 0.16, 0.32, 0.16, leg, 0, -0.16, 0);
    cube(g, 0.46, 0.42, 0.3, body, 0, 0.52, 0);
    const armL = new THREE.Group(); armL.position.set(-0.3, 0.67, 0); g.add(armL);
    const armR = new THREE.Group(); armR.position.set(0.3, 0.67, 0); g.add(armR);
    cube(armL, 0.12, 0.34, 0.12, body, 0, -0.17, 0);
    cube(armR, 0.12, 0.34, 0.12, body, 0, -0.17, 0);
    g.userData.limbs = { legL, legR, armL, armR };
    cube(g, 0.4, 0.4, 0.4, skin, 0, 0.96, 0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), makeFace(type));
    face.position.set(0, 0.96, 0.205);
    g.add(face);
    if (hero) {
      const gun = new THREE.Group();
      cube(gun, 0.08, 0.1, 0.28, 0x4a4a4a, 0, 0.05, 0.16);
      cube(gun, 0.08, 0.14, 0.08, 0x2c2c2c, 0, -0.06, 0.02);
      cube(gun, 0.1, 0.1, 0.08, 0x222222, 0, 0.05, 0.3);
      gun.position.set(0.32, 0.42, 0.18);
      g.add(gun);
    } else {
      const stars = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const s = makeStarSprite();
        const a = (i / 3) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.28, 0, Math.sin(a) * 0.18);
        stars.add(s);
      }
      stars.position.y = 1.42;
      stars.visible = false;
      g.add(stars);
      g.userData.stars = stars;
    }
    return g;
  }

  const playerMesh = makePerson('hero');
  const enemyMesh = makePerson('enemy');
  scene.add(playerMesh);
  scene.add(enemyMesh);

  const keys = {};
  const buttons = { left: false, right: false, up: false, down: false, jump: false, grab: false, shoot: false, rotL: false, rotR: false };
  let prevGrab = false;
  let jumpLatch = false;
  let toastUntil = 0;

  const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, radius: 0.28, height: 1.15, grounded: false, knockT: 0, iframe: 0 };
  const enemy = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, radius: 0.3, height: 1.15, grounded: false, stun: 0, attackCd: 0, jumpCd: 0, spawn: new THREE.Vector3() };

  let solids = [];
  let cells = new Map();
  let baskets = [];
  let animals = [];
  let bullets = [];
  let particles = [];
  let signs = [];
  let shake = 0;
  const camPos = new THREE.Vector3().copy(camera.position);
  let held = null;
  let level = 0;
  let score = 0;
  let lives = 3;
  let timeLeft = ROUND_TIME;
  let state = 'menu';
  let introT = 0;
  let levelupT = 0;
  let goalTotal = 0;
  let shootCd = 0;
  let audioCtx = null;
  const spawn = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  function beep(freq, dur, type, vol) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      gn.gain.value = vol || 0.04;
      o.connect(gn); gn.connect(audioCtx.destination);
      o.start();
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur);
    } catch (err) { /* sin audio */ }
  }

  const toastEl = document.getElementById('toast');
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    toastUntil = performance.now() + 2600;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function grassColor(x, z) {
    const palette = [0x43c84a, 0x2faa3c, 0x57d85a, 0x36b244, 0x6ee06a, 0x24963a];
    return palette[Math.abs(x * 3 + z * 5) % palette.length];
  }
  function dirtColor(x, z) {
    const palette = [0xe23b32, 0xd3543a, 0xef5340, 0xc0392b];
    return palette[Math.abs(x * 2 + z) % palette.length];
  }

  function disposeWorld() {
    world.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const list = [].concat(o.material || []);
      list.forEach((m) => {
        if (m && m.userData && m.userData.unique) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      });
      if (o.userData && o.userData.uniqueMap) o.userData.uniqueMap.dispose();
    });
    world.clear();
    animals.forEach(disposeAnimal);
    animals = [];
    bullets.forEach((b) => scene.remove(b.mesh));
    bullets = [];
    particles.forEach((p) => scene.remove(p.mesh));
    particles = [];
    signs = [];
    held = null;
    solids = [];
    baskets = [];
    cells = new Map();
  }

  function disposeAnimal(a) {
    if (!a || !a.mesh) return;
    if (a.mesh.parent) a.mesh.parent.remove(a.mesh);
    a.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.userData && o.userData.uniqueMap) o.userData.uniqueMap.dispose();
    });
  }

  function addColumn(x, z, h, top, side) {
    const materials = [mat(side), mat(side), mat(top), mat(side), mat(side), mat(side)];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, h, 1), materials);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);
    solids.push({ minX: x - 0.5, maxX: x + 0.5, minY: 0, maxY: h, minZ: z - 0.5, maxZ: z + 0.5 });
  }

  function addBoxSolid(x, y, z, sx, sy, sz, color, textured) {
    let mesh;
    if (textured) {
      const materials = [mat(color.side), mat(color.side), mat(color.top), mat(color.side), mat(color.side), mat(color.side)];
      mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), materials);
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(color));
    }
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);
    solids.push({
      minX: x - sx / 2, maxX: x + sx / 2,
      minY: y - sy / 2, maxY: y + sy / 2,
      minZ: z - sz / 2, maxZ: z + sz / 2
    });
  }

  // 120 luciérnagas con brillo que late, trayectorias suaves y halo.
  // Todo se calcula en la GPU, así que no cuesta nada de CPU y se ve fluido.
  const fireflySystem = (() => {
    const COUNT = 120;
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 44;
      pos[i * 3 + 1] = 0.8 + Math.random() * 7.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 34;
      seed[i * 4] = Math.random();
      seed[i * 4 + 1] = 0.35 + Math.random() * 0.75;
      seed[i * 4 + 2] = 0.32 + Math.random() * 0.55;
      seed[i * 4 + 3] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 600 },
        uCenter: { value: new THREE.Vector2() }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uScale;
        uniform vec2 uCenter;
        attribute vec4 aSeed;
        varying float vAlpha;
        varying vec3 vColor;
        const vec2 HALF = vec2(22.0, 17.0);
        void main() {
          vec2 rel = mod(position.xz - uCenter + HALF, HALF * 2.0) - HALF;
          float edge = (1.0 - smoothstep(0.65, 1.0, abs(rel.x) / HALF.x)) *
                       (1.0 - smoothstep(0.65, 1.0, abs(rel.y) / HALF.y));
          float t = uTime * aSeed.y;
          vec3 p = vec3(uCenter.x + rel.x, position.y, uCenter.y + rel.y);
          p.x += sin(t * 0.8 + aSeed.x * 40.0) * 1.7 + sin(t * 2.1 + aSeed.w * 9.0) * 0.35;
          p.z += cos(t * 0.65 + aSeed.x * 23.0) * 1.7 + cos(t * 1.9 + aSeed.w * 7.0) * 0.35;
          p.y += sin(t * 0.9 + aSeed.x * 17.0) * 0.9 + sin(t * 2.7 + aSeed.w * 5.0) * 0.2;
          float pulse = 0.5 + 0.5 * sin(uTime * (1.1 + aSeed.y * 1.3) + aSeed.x * 60.0);
          pulse = pulse * pulse * pulse;
          vAlpha = (0.12 + 0.88 * pulse) * edge;
          vColor = mix(vec3(0.7, 1.0, 0.32), vec3(0.3, 1.0, 0.85), aSeed.w);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(aSeed.z * (0.55 + 0.9 * pulse) * uScale / max(0.1, -mv.z), 0.0, 96.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c) * 2.0;
          if (d > 1.0) discard;
          float core = pow(max(0.0, 1.0 - d * 2.2), 2.0);
          float halo = pow(1.0 - d, 2.4);
          float a = (core * 1.3 + halo * 0.5) * vAlpha;
          gl_FragColor = vec4(vColor * (0.7 + core * 0.6), a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    scene.add(points);
    return { points, material };
  })();

  function buildMap(levelIndex) {
    const rand = mulberry32(42 + levelIndex * 97);
    const radius = 10.5 + levelIndex * 1.8;
    cells = new Map();
    for (let x = -22; x <= 22; x++) {
      for (let z = -18; z <= 18; z++) {
        const nx = x / radius;
        const nz = z / (radius * 0.78);
        let v = nx * nx + nz * nz;
        v += 0.14 * Math.sin(x * 0.8 + levelIndex) + 0.1 * Math.cos(z * 0.95);
        if (Math.abs(z) < 1.4 && Math.abs(x) < radius + 1.9) v *= 0.84;
        if (v < 1) cells.set(x + ',' + z, { x, z, h: 2, kind: 'grass' });
      }
    }

    for (let x = -2; x <= 3; x++) {
      for (let z = -3; z <= 1; z++) {
        const k = x + ',' + z;
        if (!cells.has(k)) cells.set(k, { x, z, h: 2, kind: 'grass' });
      }
    }
    const pit = [[0, -2], [1, -2], [0, -1], [1, -1]];
    pit.forEach(([x, z]) => {
      const c = cells.get(x + ',' + z);
      c.h = 1;
      c.kind = 'pit';
    });

    cells.forEach((c) => {
      if (c.kind !== 'grass') return;
      let border = false;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
        if (!cells.has((c.x + dx) + ',' + (c.z + dz))) border = true;
      });
      if (border && rand() < 0.22) c.h = 3;
      if (!border && rand() < 0.12 && Math.abs(c.x) + Math.abs(c.z) > 3) c.yellow = true;
      else if (rand() < 0.1 && Math.abs(c.x) + Math.abs(c.z) > 2) c.tree = true;
    });

    const candidates = [...cells.values()].filter((c) => c.kind === 'grass' && c.z > -1 && c.z < 4 && c.h === 2);
    candidates.sort((a, b) => a.x - b.x);
    const left = candidates[1] || candidates[0];
    const right = candidates[candidates.length - 2] || candidates[candidates.length - 1];
    if (left) { left.kind = 'padL'; left.yellow = false; left.tree = false; left.h = 2; }
    if (right) { right.kind = 'padR'; right.yellow = false; right.tree = false; right.h = 2; }

    let front = null;
    cells.forEach((c) => {
      if (c.kind !== 'grass' || Math.abs(c.x) > 1) return;
      if (!front || c.z > front.z) front = c;
    });
    const sx = front ? front.x : 0;
    const sz = front ? front.z + 1 : 6;
    const blue = { x: sx, z: sz, h: 2, kind: 'blue', yellow: false, tree: false };
    cells.set(sx + ',' + sz, blue);
    spawn.set(sx, 2, sz);

    cells.forEach((c) => {
      let top = grassColor(c.x, c.z);
      let side = dirtColor(c.x, c.z);
      if (c.kind === 'blue') top = 0x3ad0d8;
      if (c.kind === 'pit') { top = 0x3a1424; side = 0x240e16; }
      if (c.kind === 'padL') top = 0x2f6fe0;
      if (c.kind === 'padR') top = 0xf07820;
      addColumn(c.x, c.z, c.h, top, side);
      if (c.yellow) addBoxSolid(c.x, c.h + 0.46, c.z, 0.92, 0.92, 0.92, 0xf0d34a, false);
      if (c.tree) {
        cube(world, 0.22, 0.4, 0.22, 0x8a5a32, c.x, c.h + 0.2, c.z);
        cube(world, 0.62, 0.42, 0.62, 0x1c7a34, c.x, c.h + 0.58, c.z);
        cube(world, 0.4, 0.32, 0.4, 0x145c28, c.x + 0.05, c.h + 0.9, c.z);
      }
    });

    addBoxSolid(0.5, 1.45, -1.5, 0.7, 0.7, 0.7, 0x6d2f92, false);
    [[-1, -3], [2, -3], [-1, 0], [2, 0], [-1, -1], [2, -2]].forEach(([x, z]) => {
      if (!cells.has(x + ',' + z)) return;
      const h = cells.get(x + ',' + z).h;
      cube(world, 0.16, 0.7, 0.16, 0xf4f4f4, x, h + 0.35, z);
    });
    for (let i = 0; i < 4; i++) {
      cube(world, 0.55, 0.08, 0.16, 0xf7f7f7, 2, 1.15 + i * 0.22, -1.5);
    }
    cube(world, 1.7, 0.08, 0.1, 0xf4f4f4, 0.5, 2.15, -3);
    cube(world, 0.1, 0.08, 1.4, 0xf4f4f4, -1, 2.15, -1.5);
    cube(world, 0.1, 0.08, 1.4, 0xf4f4f4, 2, 2.15, -1.5);

    function placeBasket(cell, vertebrate) {
      if (!cell) return;
      const color = vertebrate ? 0x2f6fe0 : 0xf07820;
      const neon = vertebrate ? 0x5aa9ff : 0xffa23c;
      const y = cell.h;
      const S = 1.5;                 // lado total del corral (antes 2.4)
      const wall = S / 2 - 0.05;
      const pen = new THREE.Group();
      const tube = basicMat(neon);

      cube(pen, S, 0.1, S, 0x151b27, 0, 0.05, 0);

      const padMat = new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
      padMat.userData.unique = true;
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(S - 0.3, S - 0.3), padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.105;
      pen.add(pad);

      cube(pen, S, 0.28, 0.1, color, 0, 0.24, -wall);
      cube(pen, S, 0.28, 0.1, color, 0, 0.24, wall);
      cube(pen, 0.1, 0.28, S - 0.2, color, -wall, 0.24, 0);
      cube(pen, 0.1, 0.28, S - 0.2, color, wall, 0.24, 0);

      cube(pen, S, 0.05, 0.06, tube, 0, 0.41, -wall);
      cube(pen, S, 0.05, 0.06, tube, 0, 0.41, wall);
      cube(pen, 0.06, 0.05, S - 0.2, tube, -wall, 0.41, 0);
      cube(pen, 0.06, 0.05, S - 0.2, tube, wall, 0.41, 0);

      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        cube(pen, 0.14, 0.52, 0.14, 0x232c3d, sx * wall, 0.36, sz * wall);
        cube(pen, 0.17, 0.1, 0.17, tube, sx * wall, 0.66, sz * wall);
      });

      const sign = makeNeonSign(vertebrate ? 'VERTEBRADOS' : 'INVERTEBRADOS', neon);
      sign.position.set(0, 1.4, 0);
      pen.add(sign);
      signs.push({ sprite: sign, material: sign.material, baseY: 1.4, phase: Math.random() * 10 });

      const light = new THREE.PointLight(neon, 1.0, 5.5, 2);
      light.position.set(0, 0.9, 0);
      pen.add(light);

      pen.position.set(cell.x, y, cell.z);
      world.add(pen);
      baskets.push({ x: cell.x, z: cell.z, y, vertebrate, pad, light, pulse: 0 });
    }
    placeBasket(left, true);
    placeBasket(right, false);

    for (let x = -15; x <= 15; x++) {
      for (let z = -12; z <= 12; z++) {
        if (cells.has(x + ',' + z)) continue;
        let near = 99;
        cells.forEach((c) => {
          const d = Math.hypot(c.x - x, c.z - z);
          if (d < near) near = d;
        });
        if (near < 2 || near > 5.5) continue;
        if (rand() > 0.16 + levelIndex * 0.035) continue;
        const roll = rand();
        const top = roll < 0.5 ? 2 : (roll < 0.78 ? 3.05 : 4.2);
        const yellow = rand() < 0.42;
        if (yellow) addBoxSolid(x, top - 0.5, z, 1, 1, 1, 0xf0d34a, false);
        else addBoxSolid(x, top - 0.5, z, 1, 1, 1, { top: grassColor(x, z), side: dirtColor(x, z) }, true);
      }
    }

    let best = null;
    let bestD = -1;
    cells.forEach((c) => {
      if (c.kind === 'pit' || c.kind === 'blue') return;
      const d = Math.hypot(c.x - spawn.x, c.z - spawn.z);
      if (d > bestD) { bestD = d; best = c; }
    });
    const es = best || { x: 0, z: -4, h: 2 };
    enemy.spawn.set(es.x, es.h, es.z);
  }

  function groundAt(x, z, radius, feetY) {
    let best = -100;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (s.maxY > feetY + STEP) continue;
      if (!circleRect(x, z, radius, s)) continue;
      if (s.maxY > best) best = s.maxY;
    }
    return best;
  }

  function circleRect(x, z, radius, s) {
    const cx = clamp(x, s.minX, s.maxX);
    const cz = clamp(z, s.minZ, s.maxZ);
    const dx = x - cx;
    const dz = z - cz;
    return dx * dx + dz * dz < radius * radius;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function pushOut(ent) {
    for (let n = 0; n < 3; n++) {
      for (let i = 0; i < solids.length; i++) {
        const s = solids[i];
        const feet = ent.pos.y;
        const head = ent.pos.y + ent.height;
        if (feet >= s.maxY - 0.04) continue;
        if (head <= s.minY + 0.04) continue;
        const cx = clamp(ent.pos.x, s.minX, s.maxX);
        const cz = clamp(ent.pos.z, s.minZ, s.maxZ);
        let dx = ent.pos.x - cx;
        let dz = ent.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= ent.radius * ent.radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const pen = ent.radius - d;
          ent.pos.x += (dx / d) * pen;
          ent.pos.z += (dz / d) * pen;
        } else {
          const left = ent.pos.x - s.minX;
          const right = s.maxX - ent.pos.x;
          const back = ent.pos.z - s.minZ;
          const front = s.maxZ - ent.pos.z;
          const m = Math.min(left, right, back, front);
          if (m === left) ent.pos.x = s.minX - ent.radius;
          else if (m === right) ent.pos.x = s.maxX + ent.radius;
          else if (m === back) ent.pos.z = s.minZ - ent.radius;
          else ent.pos.z = s.maxZ + ent.radius;
        }
      }
    }
  }

  function moveBody(ent, dt) {
    ent.vel.y -= GRAVITY * dt;
    ent.pos.x += ent.vel.x * dt;
    ent.pos.z += ent.vel.z * dt;
    pushOut(ent);
    ent.pos.y += ent.vel.y * dt;
    const g = groundAt(ent.pos.x, ent.pos.z, ent.radius, ent.pos.y);
    if (ent.vel.y <= 0 && ent.pos.y <= g) {
      ent.pos.y = g;
      ent.vel.y = 0;
      ent.grounded = true;
    } else {
      ent.grounded = false;
    }
  }

  function randomCell(farFrom) {
    const list = [...cells.values()].filter((c) => c.kind !== 'pit' && c.kind !== 'padL' && c.kind !== 'padR' && c.kind !== 'blue');
    for (let i = 0; i < 20; i++) {
      const c = list[(Math.random() * list.length) | 0];
      if (!c) break;
      if (farFrom && Math.hypot(c.x - farFrom.x, c.z - farFrom.z) < 3) continue;
      const top = c.yellow ? c.h + 0.92 : c.h;
      return new THREE.Vector3(c.x, top, c.z);
    }
    const c = list[0];
    return new THREE.Vector3(c.x, c.h, c.z);
  }

  function spawnAnimals(list) {
    goalTotal = list.length;
    list.forEach((kind) => {
      const mesh = BUILDERS[kind]();
      const spot = randomCell(spawn);
      const a = {
        mesh,
        pos: spot.clone(),
        angle: Math.random() * Math.PI * 2,
        timer: Math.random() * 2,
        speed: 0.45 + Math.random() * 0.35
      };
      mesh.position.copy(a.pos);
      mesh.rotation.y = a.angle;
      scene.add(mesh);
      animals.push(a);
    });
  }

  function startLevel(index, nextState) {
    disposeWorld();
    level = index;
    buildMap(index);
    spawnAnimals(LEVELS[index].animals);
    player.pos.copy(spawn);
    player.vel.set(0, 0, 0);
    player.facing = 0;
    player.knockT = 0;
    enemy.pos.copy(enemy.spawn);
    enemy.vel.set(0, 0, 0);
    enemy.stun = 0;
    enemy.attackCd = 0;
    enemyMesh.userData.stars.visible = false;
    playerMesh.position.copy(player.pos);
    enemyMesh.position.copy(enemy.pos);
    state = nextState;
    introT = 2.2;
    held = null;
  }

  function begin() {
    score = 0;
    lives = 3;
    timeLeft = ROUND_TIME;
    resetHudCache();
    hideOverlay();
    startLevel(0, 'intro');
    toast('Nivel 1. El enemigo sale en un momento.');
  }

  function lerpAngle(a, b, t) {
    const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + d * t;
  }

  function inputMove() {
    let x = 0;
    let z = 0;
    if (buttons.left || keys.arrowleft || keys.a) x -= 1;
    if (buttons.right || keys.arrowright || keys.d) x += 1;
    if (buttons.up || keys.arrowup || keys.w) z -= 1;
    if (buttons.down || keys.arrowdown || keys.s) z += 1;
    const len = Math.hypot(x, z);
    if (len > 0) { x /= len; z /= len; }
    return { x, z };
  }

  function poseBody(mesh, speed01, grounded, dt) {
    const L = mesh.userData.limbs;
    if (!L) return;
    const u = mesh.userData;
    const target = grounded ? clamp(speed01, 0, 1) : 0;
    u.walk = (u.walk || 0) + (target - (u.walk || 0)) * (1 - Math.exp(-14 * dt));
    u.phase = (u.phase || 0) + dt * (6 + 6 * u.walk);
    const sw = Math.sin(u.phase) * 0.85 * u.walk;
    const air = grounded ? 0 : 1;
    L.legL.rotation.x = sw - air * 0.25;
    L.legR.rotation.x = -sw + air * 0.25;
    L.armL.rotation.x = -sw * 0.9 - air * 0.9;
    L.armR.rotation.x = sw * 0.9 - air * 0.9;
  }

  function updatePlayer(dt) {
    player.iframe = Math.max(0, player.iframe - dt);
    player.knockT = Math.max(0, player.knockT - dt);
    shootCd = Math.max(0, shootCd - dt);
    const rotating = buttons.rotL || buttons.rotR || keys.q;
    if (buttons.rotL || keys.q) player.facing += 2.8 * dt;
    if (buttons.rotR) player.facing -= 2.8 * dt;
    const mv = inputMove();
    if (player.knockT > 0) {
      player.vel.x *= Math.pow(0.04, dt);
      player.vel.z *= Math.pow(0.04, dt);
    } else {
      player.vel.x = mv.x * PLAYER_SPEED;
      player.vel.z = mv.z * PLAYER_SPEED;
      if (!rotating && (mv.x || mv.z)) {
        player.facing = lerpAngle(player.facing, Math.atan2(mv.x, mv.z), 1 - Math.exp(-10 * dt));
      }
    }
    const jumpHeld = buttons.jump || keys[' '];
    if (jumpHeld && player.grounded && player.knockT <= 0) {
      player.vel.y = JUMP_V;
      player.grounded = false;
      beep(420, 0.08, 'square', 0.03);
    }
    moveBody(player, dt);
    if (player.pos.y < -6) {
      player.pos.copy(spawn);
      player.vel.set(0, 0, 0);
      toast('Caíste al vacío. Vuelves al inicio.');
    }
    const moving = Math.hypot(player.vel.x, player.vel.z) > 0.2;
    const bob = moving ? Math.sin(performance.now() / 90) * 0.04 : 0;
    playerMesh.position.set(player.pos.x, player.pos.y + bob, player.pos.z);
    playerMesh.rotation.y = player.facing;
    poseBody(playerMesh, Math.hypot(player.vel.x, player.vel.z) / PLAYER_SPEED, player.grounded, dt);
    playerMesh.visible = player.iframe > 0 ? Math.floor(performance.now() / 80) % 2 === 0 : true;

    const grab = buttons.grab || keys.e || keys.f;
    if (grab && !prevGrab) tryGrabOrDrop();
    prevGrab = grab;

    const shoot = buttons.shoot || keys.r;
    if (shoot && shootCd <= 0) fire();
  }

  function nearestAnimal() {
    let best = null;
    let bestD = 1.45;
    for (const a of animals) {
      if (a === held) continue;
      const d = Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z);
      const dy = Math.abs(a.pos.y - player.pos.y);
      if (d < bestD && dy < 1.4) { bestD = d; best = a; }
    }
    return best;
  }

  function basketAt(pos) {
    let best = null;
    baskets.forEach((b) => {
      const d = Math.hypot(pos.x - b.x, pos.z - b.z);
      if (d < 1.15 && Math.abs(pos.y - b.y) < 1.3 && (!best || d < best.d)) best = Object.assign({ d, ref: b }, b);
    });
    return best;
  }

  function releaseHeld(spot) {
    const a = held;
    scene.attach(a.mesh);
    a.pos.copy(spot);
    a.mesh.position.copy(spot);
    a.mesh.rotation.set(0, a.angle, 0);
    held = null;
  }

  function tryGrabOrDrop() {
    if (held) {
      const b = basketAt(player.pos);
      if (b) {
        const correct = b.vertebrate === held.mesh.userData.vertebrate;
        const name = held.mesh.userData.name;
        const where = held.mesh.userData.vertebrate ? 'izquierda, con los vertebrados' : 'derecha, con los invertebrados';
        if (correct) {
          score += 10;
          if (b.ref) b.ref.pulse = 1;
          beep(660, 0.12, 'square', 0.05);
          burst(held.mesh.getWorldPosition(new THREE.Vector3()), b.vertebrate ? 0x6ea8ff : 0xffb067);
          const done = held;
          held = null;
          animals = animals.filter((x) => x !== done);
          disposeAnimal(done);
          toast(name + ' en la canasta correcta. +10 pts');
          if (animals.length === 0) onLevelComplete();
        } else {
          score -= 10;
          shake = Math.max(shake, 0.14);
          beep(180, 0.18, 'sawtooth', 0.05);
          const spot = randomCell(player.pos);
          releaseHeld(spot);
          toast(name + ' no va en esa canasta. Va a la ' + where + '. −10 pts');
        }
      } else {
        const x = player.pos.x + Math.sin(player.facing) * 0.85;
        const z = player.pos.z + Math.cos(player.facing) * 0.85;
        let y = groundAt(x, z, 0.2, player.pos.y + 0.5);
        if (y < -20) releaseHeld(player.pos.clone());
        else releaseHeld(new THREE.Vector3(x, y, z));
        toast('Soltaste el animal.');
      }
    } else {
      const a = nearestAnimal();
      if (!a) { toast('No hay un animal cerca.'); return; }
      playerMesh.attach(a.mesh);
      a.mesh.position.set(0.46, 0.7, 0.4);
      a.mesh.rotation.set(0, -0.5, 0);
      held = a;
      beep(520, 0.07, 'square', 0.04);
      toast('Llevas: ' + a.mesh.userData.name + (a.mesh.userData.vertebrate ? ' (vertebrado → izquierda)' : ' (invertebrado → derecha)'));
    }
  }

  function fire() {
    shootCd = 0.48;
    _tmpV.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    const mesh = new THREE.Mesh(bulletGeo, bulletMat);
    const glow = new THREE.Sprite(bulletGlowMat);
    glow.scale.set(1.2, 1.2, 1);
    mesh.add(glow);
    const origin = new THREE.Vector3(0.32, 0.55, 0.55);
    playerMesh.localToWorld(origin);
    mesh.position.copy(origin);
    scene.add(mesh);
    bullets.push({ mesh, pos: origin.clone(), vel: _tmpV.clone().multiplyScalar(16), life: 1.15 });
    beep(760, 0.05, 'square', 0.03);
  }

  function updateAnimals(dt) {
    const t = performance.now() / 1000;
    for (const a of animals) {
      if (a === held) continue;
      a.timer -= dt;
      if (a.timer <= 0) {
        a.angle = Math.random() * Math.PI * 2;
        a.timer = 1.4 + Math.random() * 2.4;
      }
      const nx = a.pos.x + Math.sin(a.angle) * a.speed * dt;
      const nz = a.pos.z + Math.cos(a.angle) * a.speed * dt;
      const g0 = groundAt(a.pos.x, a.pos.z, 0.18, a.pos.y + 0.2);
      const g1 = groundAt(nx, nz, 0.18, a.pos.y + 0.3);
      if (g1 > -20 && g1 <= g0 + 0.2) {
        a.pos.x = nx;
        a.pos.z = nz;
        a.pos.y = g1;
        a.mesh.rotation.y = a.angle;
      } else {
        a.angle += Math.PI / 2;
        a.timer = 0.3;
      }
      const hopAmp = a.mesh.userData.kind === 'conejo' ? 0.12 : 0.045;
      const hop = Math.abs(Math.sin(t * (a.mesh.userData.kind === 'conejo' ? 8 : 4) + a.pos.x)) * hopAmp;
      a.mesh.position.set(a.pos.x, a.pos.y + hop, a.pos.z);
    }
  }

  function steerEnemy() {
    const dx = player.pos.x - enemy.pos.x;
    const dz = player.pos.z - enemy.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len;
    const fz = dz / len;
    const angles = [0, 0.7, -0.7, 1.2, -1.2];
    for (const ang of angles) {
      const s = Math.sin(ang);
      const c = Math.cos(ang);
      const rx = fx * c - fz * s;
      const rz = fx * s + fz * c;
      const nx = enemy.pos.x + rx * 0.75;
      const nz = enemy.pos.z + rz * 0.75;
      const g = groundAt(nx, nz, enemy.radius * 0.7, enemy.pos.y + 0.2);
      if (g > enemy.pos.y - 0.7 && g < enemy.pos.y + 1.35) {
        return { x: rx, z: rz, jump: g > enemy.pos.y + 0.48 };
      }
    }
    return { x: fx, z: fz, jump: false };
  }

  function updateEnemy(dt) {
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);
    enemy.jumpCd = Math.max(0, enemy.jumpCd - dt);
    if (enemy.stun > 0) {
      enemy.stun -= dt;
      enemy.vel.x = 0;
      enemy.vel.z = 0;
      enemy.facing += dt * 5.5;
      enemyMesh.userData.stars.visible = true;
      enemyMesh.userData.stars.rotation.y += dt * 4;
      enemyMesh.userData.stars.children.forEach((s, i) => {
        s.position.y = Math.sin(performance.now() / 180 + i) * 0.08;
      });
      if (enemy.stun <= 0) {
        enemy.stun = 0;
        enemyMesh.userData.stars.visible = false;
        toast('El enemigo se despertó.');
      }
    } else {
      enemyMesh.userData.stars.visible = false;
      const dir = steerEnemy();
      const sp = ENEMY_SPEEDS[level] || ENEMY_SPEEDS[2];
      enemy.vel.x = dir.x * sp;
      enemy.vel.z = dir.z * sp;
      enemy.facing = lerpAngle(enemy.facing, Math.atan2(dir.x, dir.z), 1 - Math.exp(-8 * dt));
      if (dir.jump && enemy.grounded && enemy.jumpCd <= 0) {
        enemy.vel.y = JUMP_V * 0.95;
        enemy.jumpCd = 0.55;
      }
    }
    moveBody(enemy, dt);
    if (enemy.pos.y < -6) {
      enemy.pos.copy(enemy.spawn);
      enemy.vel.set(0, 0, 0);
    }
    enemyMesh.position.set(enemy.pos.x, enemy.pos.y, enemy.pos.z);
    enemyMesh.rotation.y = enemy.facing;
    poseBody(enemyMesh, enemy.stun > 0 ? 0 : Math.hypot(enemy.vel.x, enemy.vel.z) / (ENEMY_SPEEDS[level] || ENEMY_SPEEDS[2]), enemy.grounded, dt);

    if (state !== 'play' || enemy.stun > 0) return;
    const d = Math.hypot(enemy.pos.x - player.pos.x, enemy.pos.z - player.pos.z);
    const dy = Math.abs(enemy.pos.y - player.pos.y);
    if (d < 0.92 && dy < 1.2 && enemy.attackCd <= 0 && player.iframe <= 0) {
      if (held) {
        score -= 5;
        onHit(false);
        const name = held.mesh.userData.name;
        releaseHeld(randomCell(player.pos));
        enemy.attackCd = 1.35;
        beep(140, 0.2, 'sawtooth', 0.05);
        toast('El enemigo robó a ' + name + '. −5 pts');
      } else {
        lives -= 1;
        onHit(true);
        player.iframe = 1.7;
        player.knockT = 0.28;
        const kx = player.pos.x - enemy.pos.x;
        const kz = player.pos.z - enemy.pos.z;
        const kl = Math.hypot(kx, kz) || 1;
        player.vel.x = (kx / kl) * 7;
        player.vel.z = (kz / kl) * 7;
        player.vel.y = 4.5;
        enemy.attackCd = 1.25;
        beep(90, 0.22, 'square', 0.06);
        if (lives <= 0) {
          lives = 0;
          endGame(false, 'El enemigo te derrotó. Te quedaste sin vidas.');
        } else {
          toast('¡Te golpeó! Te quedan ' + lives + (lives === 1 ? ' vida.' : ' vidas.'));
        }
      }
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      _tmpV.set(enemy.pos.x, enemy.pos.y + 0.6, enemy.pos.z);
      const hit = enemy.stun <= 0 && b.pos.distanceTo(_tmpV) < 0.75;
      if (hit) {
        enemy.stun = STUN_TIME;
        enemy.vel.set(0, 0, 0);
        enemyMesh.userData.stars.visible = true;
        burst(_tmpV.clone(), 0xffe14a);
        beep(880, 0.15, 'square', 0.05);
        toast('Enemigo aturdido 10 segundos.');
      }
      if (hit || b.life <= 0) {
        scene.remove(b.mesh);
        bullets.splice(i, 1);
      }
    }
  }

  function burst(pos, color) {
    const m = basicMat(color);
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(unitBox, m);
      const sz = 0.09 + Math.random() * 0.09;
      mesh.scale.setScalar(sz);
      mesh.position.copy(pos);
      scene.add(mesh);
      particles.push({
        mesh,
        sz,
        v: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 2.6, (Math.random() - 0.5) * 4),
        life: 0.7,
        max: 0.7
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.v.y -= GRAVITY * 0.35 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 5;
      p.mesh.scale.setScalar(p.sz * Math.max(0.05, p.life / p.max));
      if (p.life <= 0) {
        scene.remove(p.mesh);
        particles.splice(i, 1);
      }
    }
  }

  function updateFireflies(dt, now) {
    const u = fireflySystem.material.uniforms;
    u.uTime.value = now * 0.001;
    u.uCenter.value.set(player.pos.x, player.pos.z);
    starField.rotation.y += dt * 0.006;
  }

  function updateBaskets(dt, now) {
    const t = now * 0.001;
    for (const b of baskets) {
      b.pulse = Math.max(0, b.pulse - dt * 1.6);
      let base = 0.26 + Math.sin(t * 2.2 + b.x) * 0.07;
      // Si llevas un animal, el corral correcto late para guiarte
      if (held && held.mesh.userData.vertebrate === b.vertebrate) base += 0.14 + 0.1 * Math.sin(t * 6);
      b.pad.material.opacity = base + b.pulse * 0.55;
      b.light.intensity = 1.0 + b.pulse * 3.2;
    }
  }

  function updateSigns(now) {
    const t = now * 0.001;
    for (const sg of signs) {
      const k = t + sg.phase;
      sg.sprite.position.y = sg.baseY + Math.sin(k * 1.6) * 0.05;
      const flick = Math.sin(k * 23) * Math.sin(k * 5.7) > 0.93 ? 0.5 : 1;
      sg.material.opacity += (flick - sg.material.opacity) * 0.5;
    }
  }

  function onLevelComplete() {
    for (const old of animals) disposeAnimal(old);
    const nextSet = LEVELS[level % LEVELS.length].animals.slice();
    animals = [];
    for (const a of nextSet) {
      const mesh = BUILDERS[a]();
      const spot = randomCell(spawn);
      const animal = {
        mesh,
        pos: spot.clone(),
        angle: Math.random() * Math.PI * 2,
        timer: Math.random() * 2,
        speed: 0.45 + Math.random() * 0.35
      };
      mesh.position.copy(animal.pos);
      mesh.rotation.y = animal.angle;
      scene.add(mesh);
      animals.push(animal);
    }
    goalTotal = animals.length;
    state = 'play';
    toast('Nuevo lote de animales. Suma la mayor puntuación posible.');
    beep(520, 0.08, 'square', 0.04);
  }

  function endGame(win, msg) {
    state = win ? 'win' : 'dead';
    const title = win ? '¡Ganaste!' : 'Fin de la partida';
    showOverlay(title, msg + ' Puntos: ' + score + '.', 'Reintentar');
  }

  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ov-title');
  const ovText = document.getElementById('ov-text');
  const ovBtn = document.getElementById('ov-btn');
  const ovRules = document.getElementById('ov-rules');
  function showOverlay(title, text, buttonLabel, showRules) {
    overlay.hidden = false;
    ovTitle.textContent = title;
    ovText.textContent = text;
    ovRules.hidden = !showRules;
    if (buttonLabel) { ovBtn.hidden = false; ovBtn.textContent = buttonLabel; }
    else ovBtn.hidden = true;
  }
  function hideOverlay() { overlay.hidden = true; }

  function fmtTime(t) {
    const s = Math.max(0, Math.ceil(t));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  // ---------------- HUD ----------------
  const $ = (id) => document.getElementById(id);
  const RING_LEN = 2 * Math.PI * 30;
  const hudEls = {
    fx: $('fx'),
    life: $('hud-lives'),
    hearts: Array.from(document.querySelectorAll('#hud-lives .heart')),
    lifeFill: $('lifebar-fill'),
    time: $('hud-time'),
    timeText: $('time-text'),
    timeRing: $('time-ring'),
    scoreCard: $('hud-score-card'),
    scoreNum: $('score-num'),
    pops: $('pops'),
    level: $('hud-level'),
    goalText: $('hud-goal'),
    goalFill: $('goal-fill'),
    held: $('hud-held'),
    heldEmoji: $('held-emoji'),
    heldName: $('held-name'),
    enemy: $('hud-enemy'),
    enemyText: $('enemy-text')
  };
  hudEls.timeRing.style.strokeDasharray = RING_LEN.toFixed(2);
  const hudCache = {};

  function resetHudCache() {
    hudCache.lives = -1;
    hudCache.lastScore = 0;
    hudCache.shown = 0;
    hudCache.shownInt = null;
    hudCache.sec = -1;
    hudCache.ringOff = -1;
    hudCache.level = -1;
    hudCache.placed = -1;
    hudCache.total = -1;
    hudCache.held = '#';
    hudCache.enemy = '';
    hudEls.scoreNum.textContent = '0';
  }
  resetHudCache();

  function restartAnim(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function popScore(d) {
    const sp = document.createElement('span');
    sp.className = 'pop ' + (d > 0 ? 'plus' : 'minus');
    sp.textContent = (d > 0 ? '+' : '−') + Math.abs(d);
    sp.addEventListener('animationend', () => sp.remove());
    hudEls.pops.appendChild(sp);
  }

  function onHit(strong) {
    shake = Math.max(shake, strong ? 0.5 : 0.22);
    restartAnim(hudEls.fx, 'hit');
  }

  function fmtTime(t) {
    const sec = Math.max(0, Math.ceil(t));
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  function updateHud(dt) {
    // Vidas
    if (hudCache.lives !== lives) {
      if (hudCache.lives > lives) restartAnim(hudEls.life, 'hurt');
      hudEls.hearts.forEach((h, i) => h.classList.toggle('lost', i >= lives));
      hudEls.lifeFill.style.transform = 'scaleX(' + (Math.max(0, lives) / 3).toFixed(3) + ')';
      hudEls.life.dataset.lives = Math.max(0, lives);
      document.body.dataset.lives = Math.max(0, lives);
      hudCache.lives = lives;
    }

    // Puntos: números que cuentan y aviso flotante
    if (hudCache.lastScore !== score) {
      const d = score - hudCache.lastScore;
      if (Math.abs(d) <= 10) {
        popScore(d);
        restartAnim(hudEls.scoreCard, d > 0 ? 'gain' : 'loss');
      }
      hudCache.lastScore = score;
    }
    const diff = score - hudCache.shown;
    if (Math.abs(diff) > 0.01) {
      hudCache.shown += diff * (1 - Math.exp(-9 * dt));
      if (Math.abs(score - hudCache.shown) < 0.5) hudCache.shown = score;
      const shownInt = Math.round(hudCache.shown);
      if (shownInt !== hudCache.shownInt) {
        hudCache.shownInt = shownInt;
        hudEls.scoreNum.textContent = shownInt;
      }
    }

    // Temporizador: anillo que se vacía y dígitos que cambian una vez por segundo
    const sec = Math.max(0, Math.ceil(timeLeft));
    if (sec !== hudCache.sec) {
      hudCache.sec = sec;
      hudEls.timeText.textContent = fmtTime(timeLeft);
      hudEls.time.classList.toggle('warn', sec <= 60 && sec > 20);
      hudEls.time.classList.toggle('crit', sec <= 20);
    }
    const off = RING_LEN * (1 - clamp(timeLeft / ROUND_TIME, 0, 1));
    if (Math.abs(off - hudCache.ringOff) > 0.05) {
      hudCache.ringOff = off;
      hudEls.timeRing.style.strokeDashoffset = off.toFixed(2);
    }

    // Nivel y progreso
    if (hudCache.level !== level) {
      hudCache.level = level;
      hudEls.level.textContent = 'Nivel ' + (level + 1) + '/3';
    }
    const placed = goalTotal - animals.length;
    if (hudCache.placed !== placed || hudCache.total !== goalTotal) {
      hudCache.placed = placed;
      hudCache.total = goalTotal;
      hudEls.goalText.textContent = 'Animales ' + placed + '/' + goalTotal;
      hudEls.goalFill.style.transform = 'scaleX(' + (goalTotal ? clamp(placed / goalTotal, 0, 1) : 0).toFixed(3) + ')';
    }

    // Manos
    const heldKey = held ? held.mesh.userData.kind : '';
    if (heldKey !== hudCache.held) {
      hudCache.held = heldKey;
      hudEls.held.classList.toggle('has', !!held);
      hudEls.heldEmoji.textContent = held ? (EMOJI[heldKey] || '🐾') : '✋';
      hudEls.heldName.textContent = held ? held.mesh.userData.name : 'Manos vacías';
    }

    // Enemigo
    let es = 'wait';
    let et = 'Enemigo: esperando';
    if (enemy.stun > 0) { es = 'stun'; et = 'Enemigo aturdido ' + Math.ceil(enemy.stun) + 's'; }
    else if (state === 'play') { es = 'chase'; et = 'Enemigo: persiguiendo'; }
    if (et !== hudCache.enemy) {
      hudCache.enemy = et;
      hudEls.enemyText.textContent = et;
      hudEls.enemy.dataset.state = es;
    }

    // Mensaje emergente
    if (toastUntil && performance.now() > toastUntil) {
      toastEl.classList.remove('show');
      toastUntil = 0;
    }
  }

  // ---------------- Cámara ----------------
  const _desired = new THREE.Vector3();
  function updateCamera(dt) {
    const dist = 12 + level * 2.1;
    _desired.set(
      player.pos.x + player.vel.x * 0.12,
      player.pos.y + dist * 0.82,
      player.pos.z + dist + player.vel.z * 0.12
    );
    camPos.lerp(_desired, 1 - Math.exp(-4 * dt));
    camera.position.copy(camPos);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-9 * dt);
    }
    camLook.set(player.pos.x, player.pos.y + 0.6, player.pos.z);
    camera.lookAt(camLook);
  }

  // ---------------- Resolución adaptable ----------------
  // Si el equipo va justo baja un poco la resolución; si sobra, la sube. Así siempre se siente fluido.
  const perf = {
    ratio: Math.min(window.devicePixelRatio || 1, 2),
    max: Math.min(window.devicePixelRatio || 1, 2),
    acc: 0,
    frames: 0,
    noRaiseUntil: 0
  };
  function applyRenderSize() {
    renderer.setPixelRatio(perf.ratio);
    renderer.setSize(innerWidth, innerHeight);
    fireflySystem.material.uniforms.uScale.value =
      renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
  }
  function trackPerf(raw, now) {
    if (raw > 0.25) return;            // pestaña oculta o pausa
    perf.acc += raw;
    perf.frames++;
    if (perf.acc < 1.2) return;
    const fps = perf.frames / perf.acc;
    let r = perf.ratio;
    if (fps < 46 && r > 1) {
      r = Math.max(1, r - 0.25);
      perf.noRaiseUntil = now + 10000;
    } else if (fps > 58 && r < perf.max && now > perf.noRaiseUntil) {
      r = Math.min(perf.max, r + 0.25);
    }
    if (r !== perf.ratio) { perf.ratio = r; applyRenderSize(); }
    perf.acc = 0;
    perf.frames = 0;
  }

  // ---------------- Bucle principal ----------------
  let last = performance.now();
  function frame(now) {
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.033, raw);
    trackPerf(raw, now);
    if (state === 'intro') {
      introT -= dt;
      updatePlayer(dt);
      updateAnimals(dt);
      updateBullets(dt);
      if (introT <= 0) {
        state = 'play';
        toast('¡El enemigo empezó a perseguirte!');
      }
    } else if (state === 'play') {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        endGame(false, 'Se acabaron los 10 minutos.');
      } else {
        updatePlayer(dt);
        updateAnimals(dt);
        updateEnemy(dt);
        updateBullets(dt);
      }
    } else if (state === 'levelup') {
      levelupT -= dt;
      updateAnimals(dt);
      if (levelupT <= 0) {
        hideOverlay();
        startLevel(level + 1, 'intro');
        toast('Nivel ' + (level + 1) + '. El enemigo sale en un momento.');
      }
    } else if (state === 'menu') {
      updateAnimals(dt);
    }
    updateParticles(dt);
    updateFireflies(dt, now);
    updateBaskets(dt, now);
    updateSigns(now);
    updateCamera(dt);
    updateHud(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  function bindHold(id, name) {
    const el = document.getElementById(id);
    const setState = (active) => {
      buttons[name] = active;
      el.classList.toggle('active', active);
    };
    const down = (e) => {
      e.preventDefault();
      if (typeof e.pointerId !== 'undefined') {
        try { el.setPointerCapture(e.pointerId); } catch (err) { }
      }
      setState(true);
    };
    const up = (e) => {
      if (e && typeof e.pointerId !== 'undefined') {
        try { el.releasePointerCapture(e.pointerId); } catch (err) { }
      }
      setState(false);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', () => setState(false));
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', () => setState(false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  bindHold('btn-left', 'left');
  bindHold('btn-right', 'right');
  bindHold('btn-up', 'up');
  bindHold('btn-down', 'down');
  bindHold('btn-jump', 'jump');
  bindHold('btn-grab', 'grab');
  bindHold('btn-shoot', 'shoot');
  bindHold('btn-rotl', 'rotL');
  bindHold('btn-rotr', 'rotR');

  function clearInputState() {
    Object.keys(keys).forEach((k) => { keys[k] = false; });
    Object.keys(buttons).forEach((k) => { buttons[k] = false; });
    document.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
  }

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (e.repeat && (key === ' ' || key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright' || key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'q' || key === 'e' || key === 'f' || key === 'r')) return;
    keys[key] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', clearInputState);
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    applyRenderSize();
  });
  ovBtn.addEventListener('click', () => {
    ovBtn.blur();
    if (state === 'menu' || state === 'dead' || state === 'win') begin();
  });

  applyRenderSize();
  showOverlay('Clasificación de animales', menuText, 'Empezar', true);
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 100px "Fredoka"').then(() => {
      signs.forEach((sg) => sg.sprite.userData.redraw && sg.sprite.userData.redraw());
    }).catch(() => { });
  }
  startLevel(0, 'menu');
  requestAnimationFrame(frame);

  window.__game = {
    snapshot() {
      return {
        state, score, lives, timeLeft, level,
        animals: animals.length,
        held: held ? held.mesh.userData.name : null,
        player: player.pos.clone(),
        enemy: { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z, stun: enemy.stun },
        baskets: baskets.map((b) => ({ x: b.x, z: b.z, vertebrate: b.vertebrate }))
      };
    }
  };
})();