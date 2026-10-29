/**
 * Three.js 3D Interactive Viewer & Simulation Player
 * 负责集装箱外框渲染、货物方块装箱动画、透视轴测切换与射线悬浮拾取
 */

class Scene3DViewer {
    constructor(containerDomId, onHoverCallback) {
        this.domElement = document.getElementById(containerDomId);
        this.onHoverCallback = onHoverCallback;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        this.containerGroup = null;
        this.itemsGroup = null;
        this.boxMeshes = [];
        this.containerDims = { l: 0, w: 0, h: 0 };

        // 播放器动画控制状态
        this.isPlaying = false;
        this.currentStep = 0;
        this.totalSteps = 0;
        this.playbackSpeed = 1000; // ms per step
        this.playTimer = null;
        this.onStepChangeCallback = null;

        // 拾取高亮
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2(-1000, -1000);
        this.hoveredMesh = null;
        this.originalEmissive = null;

        this.init();
    }

    init() {
        const width = this.domElement.clientWidth;
        const height = this.domElement.clientHeight;

        // 1. Scene
        this.scene = new THREE.Scene();

        // 2. Camera
        this.camera = new THREE.PerspectiveCamera(45, width / height, 10, 200000);
        this.camera.position.set(20000, 18000, 25000);

        // 3. Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.domElement.appendChild(this.renderer.domElement);

        // 4. Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // 允许稍微仰视底部

        // 5. Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight1.position.set(30000, 40000, 20000);
        dirLight1.castShadow = true;
        this.scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.35);
        dirLight2.position.set(-20000, 10000, -20000);
        this.scene.add(dirLight2);

        // Groups
        this.containerGroup = new THREE.Group();
        this.itemsGroup = new THREE.Group();
        this.scene.add(this.containerGroup);
        this.scene.add(this.itemsGroup);

        // 监听事件
        window.addEventListener('resize', () => this.onWindowResize());
        this.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.domElement.addEventListener('mouseleave', () => this.onMouseLeave());

        this.animateLoop();
    }

    /**
     * 渲染整套装箱方案
     */
    renderPackingScene(container, packedItems, onStepChange) {
        this.stop();
        this.containerDims = { l: container.length, w: container.width, h: container.height };
        this.onStepChangeCallback = onStepChange;

        // 清空旧物体
        this.clearGroup(this.containerGroup);
        this.clearGroup(this.itemsGroup);
        this.boxMeshes = [];

        // 1. 绘制容器外框与地板
        this.buildContainerWireframe(container.length, container.width, container.height);

        // 2. 为每个已装物品构建3D方块
        packedItems.forEach((item, idx) => {
            const mesh = this.createItemMesh(item, container);
            mesh.visible = false; // 初始全部隐藏，供播放器逐帧展示
            this.itemsGroup.add(mesh);
            this.boxMeshes.push(mesh);
        });

        this.totalSteps = packedItems.length;
        this.currentStep = this.totalSteps; // 默认直接显示装满终局

        // 调整相机视距以适配容器大小
        this.setViewMode('isometric');
        this.updatePlayerDisplay(false);
    }

    /**
     * 构建集装箱半透明实体外框、网格标尺与边框线
     */
    buildContainerWireframe(l, w, h) {
        // 地板网格
        const gridHelper = new THREE.GridHelper(Math.max(l, w) * 1.5, 20, 0x38bdf8, 0x334155);
        gridHelper.position.y = 0;
        this.containerGroup.add(gridHelper);

        // 容器半透明背板与底板材质
        const backGeom = new THREE.BoxGeometry(l, h, w);
        const edges = new THREE.EdgesGeometry(backGeom);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 }));
        line.position.set(0, h / 2, 0);
        this.containerGroup.add(line);

        // 底部承重板
        const floorGeom = new THREE.PlaneGeometry(l, w);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8, side: THREE.DoubleSide });
        const floorMesh = new THREE.Mesh(floorGeom, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(0, -2, 0);
        floorMesh.receiveShadow = true;
        this.containerGroup.add(floorMesh);
    }

    /**
     * 构建单件货物的 3D Mesh
     */
    createItemMesh(item, container) {
        const dx = item.packedLength;
        const dy = item.packedHeight;
        const dz = item.packedWidth;

        let geom;
        if (item.shape === 'cylinder' || item.isCylinder) {
            if (item.cylinderOrientation === 'X') {
                // 顺长放置：长度沿X(深度)，圆截面在YZ平面
                const r = Math.max(1, (Math.min(dy, dz) - 4) / 2);
                geom = new THREE.CylinderGeometry(r, r, Math.max(1, dx - 4), 32);
                geom.rotateZ(-Math.PI / 2);
            } else if (item.cylinderOrientation === 'Y') {
                // 防滚落竖放：长度沿Y(垂直)，圆截面在XZ底面
                const r = Math.max(1, (Math.min(dx, dz) - 4) / 2);
                geom = new THREE.CylinderGeometry(r, r, Math.max(1, dy - 4), 32);
            } else if (item.cylinderOrientation === 'Z') {
                const r = Math.max(1, (Math.min(dx, dy) - 4) / 2);
                geom = new THREE.CylinderGeometry(r, r, Math.max(1, dz - 4), 32);
                geom.rotateX(Math.PI / 2);
            } else {
                const r = Math.max(1, (Math.min(dy, dz) - 4) / 2);
                geom = new THREE.CylinderGeometry(r, r, Math.max(1, dx - 4), 32);
                geom.rotateZ(-Math.PI / 2);
            }
        } else {
            geom = new THREE.BoxGeometry(Math.max(1, dx - 4), Math.max(1, dy - 4), Math.max(1, dz - 4)); // 减小一点缝隙方便识别单件
        }

        const color = new THREE.Color(item.color || '#38bdf8');
        const mat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.35,
            metalness: 0.15
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // 计算世界坐标中心点（使容器左下后角对齐场景原点[-L/2, 0, -W/2]）
        const centerX = item.x + dx / 2 - container.length / 2;
        const centerY = item.y + dy / 2;
        const centerZ = item.z + dz / 2 - container.width / 2;

        mesh.position.set(centerX, centerY, centerZ);
        mesh.userData = { itemData: item };

        // 黑色细轮廓线增强堆叠辨识度
        const edges = new THREE.EdgesGeometry(geom, (item.shape === 'cylinder' || item.isCylinder) ? 15 : 1);
        const wireframe = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
        mesh.add(wireframe);

        return mesh;
    }

    /**
     * 切换视角模式
     */
    setViewMode(mode) {
        const { l, w, h } = this.containerDims;
        const maxDim = Math.max(l, w, h) || 12000;

        switch (mode) {
            case 'isometric':
                this.tweenCamera({ x: l * 0.8, y: h * 1.3, z: w * 1.6 }, { x: 0, y: h * 0.4, z: 0 });
                break;
            case 'top':
                this.tweenCamera({ x: 0, y: maxDim * 1.8, z: 0.01 }, { x: 0, y: 0, z: 0 });
                break;
            case 'side':
                this.tweenCamera({ x: maxDim * 1.7, y: h * 0.5, z: 0 }, { x: 0, y: h * 0.5, z: 0 });
                break;
            case 'front':
                this.tweenCamera({ x: 0, y: h * 0.5, z: maxDim * 1.7 }, { x: 0, y: h * 0.5, z: 0 });
                break;
        }
    }

    tweenCamera(targetPos, targetLookAt) {
        new TWEEN.Tween(this.camera.position)
            .to(targetPos, 700)
            .easing(TWEEN.Easing.Cubic.Out)
            .start();

        new TWEEN.Tween(this.controls.target)
            .to(targetLookAt, 700)
            .easing(TWEEN.Easing.Cubic.Out)
            .onUpdate(() => this.controls.update())
            .start();
    }

    toggleWireframe(visible) {
        if (this.containerGroup) {
            this.containerGroup.visible = visible;
        }
    }

    /* ==================== 作业播放器控制 (Player Controls) ==================== */

    play() {
        if (this.totalSteps === 0) return;
        if (this.currentStep >= this.totalSteps) {
            this.currentStep = 0; // 如果已经在最后，重新开始
        }
        this.isPlaying = true;
        this.stepNextWithAnimation();
    }

    pause() {
        this.isPlaying = false;
        if (this.playTimer) clearTimeout(this.playTimer);
    }

    stop() {
        this.pause();
        this.currentStep = 0;
    }

    stepPrev() {
        this.pause();
        if (this.currentStep > 0) {
            this.currentStep--;
            this.updatePlayerDisplay(false);
        }
    }

    stepNext() {
        this.pause();
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updatePlayerDisplay(true);
        }
    }

    goToStep(step) {
        this.pause();
        this.currentStep = Math.max(0, Math.min(step, this.totalSteps));
        this.updatePlayerDisplay(false);
    }

    setSpeed(speedMs) {
        this.playbackSpeed = speedMs;
    }

    stepNextWithAnimation() {
        if (!this.isPlaying) return;

        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updatePlayerDisplay(true);
            
            this.playTimer = setTimeout(() => {
                this.stepNextWithAnimation();
            }, this.playbackSpeed);
        } else {
            this.isPlaying = false;
            if (this.onStepChangeCallback) this.onStepChangeCallback(this.currentStep, this.totalSteps, false);
        }
    }

    updatePlayerDisplay(animateLatest) {
        this.boxMeshes.forEach((mesh, idx) => {
            if (idx < this.currentStep) {
                mesh.visible = true;
                if (idx === this.currentStep - 1 && animateLatest) {
                    // 对最新放下的方块应用“从天而降+弹性缩放”微动画
                    const targetY = mesh.position.y;
                    mesh.position.y = targetY + 1500;
                    mesh.scale.set(0.1, 0.1, 0.1);

                    new TWEEN.Tween(mesh.position)
                        .to({ y: targetY }, 400)
                        .easing(TWEEN.Easing.Bounce.Out)
                        .start();

                    new TWEEN.Tween(mesh.scale)
                        .to({ x: 1, y: 1, z: 1 }, 350)
                        .easing(TWEEN.Easing.Back.Out)
                        .start();
                } else {
                    mesh.scale.set(1, 1, 1);
                }
            } else {
                mesh.visible = false;
            }
        });

        if (this.onStepChangeCallback) {
            this.onStepChangeCallback(this.currentStep, this.totalSteps, this.isPlaying);
        }
    }

    /* ==================== 鼠标拾取悬浮交互 (Raycasting) ==================== */

    onMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.checkRaycast();
    }

    onMouseLeave() {
        this.mouse.set(-1000, -1000);
        this.clearHover();
        if (this.onHoverCallback) this.onHoverCallback(null);
    }

    checkRaycast() {
        if (this.boxMeshes.length === 0) return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        // 只检测当前可见的方块
        const visibleMeshes = this.boxMeshes.filter(m => m.visible);
        const intersects = this.raycaster.intersectObjects(visibleMeshes);

        if (intersects.length > 0) {
            const hitMesh = intersects[0].object;
            if (this.hoveredMesh !== hitMesh) {
                this.clearHover();
                this.hoveredMesh = hitMesh;
                this.originalEmissive = hitMesh.material.emissive ? hitMesh.material.emissive.clone() : new THREE.Color(0x000000);
                hitMesh.material.emissive = new THREE.Color(0x38bdf8);
                hitMesh.material.emissiveIntensity = 0.5;

                if (this.onHoverCallback) {
                    this.onHoverCallback(hitMesh.userData.itemData);
                }
            }
        } else {
            this.clearHover();
            if (this.onHoverCallback) this.onHoverCallback(null);
        }
    }

    clearHover() {
        if (this.hoveredMesh) {
            if (this.originalEmissive) {
                this.hoveredMesh.material.emissive.copy(this.originalEmissive);
            }
            this.hoveredMesh = null;
        }
    }

    /* ==================== 辅助方法 ==================== */

    onWindowResize() {
        if (!this.domElement || !this.renderer) return;
        const width = this.domElement.clientWidth;
        const height = this.domElement.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    clearGroup(group) {
        while (group.children.length > 0) {
            const obj = group.children[0];
            group.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        }
    }

    animateLoop() {
        requestAnimationFrame(() => this.animateLoop());
        TWEEN.update();
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
