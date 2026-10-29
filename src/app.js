// Modules loaded via global script tags in index.html

// 预设标准容器规格表
const PRESET_CONTAINERS = {
    '40HQ.SPECIAL': { name: '40尺专用特殊规格 (40HQ.SPECIAL)', l: 11800, w: 2350, h: 2650, maxW: 28800 },
    '20GP': { name: '20尺普通集装箱 (20GP)', l: 5898, w: 2352, h: 2393, maxW: 28000 },
    '40GP': { name: '40尺普通集装箱 (40GP)', l: 12032, w: 2352, h: 2393, maxW: 28800 },
    '40HQ': { name: '40尺高柜集装箱 (40HQ)', l: 12032, w: 2352, h: 2698, maxW: 28800 },
    'TRUCK42': { name: '标准4.2米厢式货车', l: 4200, w: 2100, h: 2100, maxW: 3000 },
    'PALLET': { name: '标准欧洲托盘堆叠', l: 1200, w: 800, h: 1500, maxW: 1000 },
    'BOX_L': { name: '大型物流周转箱', l: 600, w: 400, h: 350, maxW: 50 }
};

class AppController {
    constructor() {
        this.items = [];
        this.currentContainer = null;
        this.lastPackingResult = null;
        this.engine = new BinPackingEngine();
        this.sceneViewer = null;

        this.initDOM();
    }

    initDOM() {
        // 初始化 3D 场景
        this.sceneViewer = new Scene3DViewer('canvas-container', (hoveredItem) => {
            this.handleItemHover(hoveredItem);
        });

        // 初始化新手导览系统 (首次访问自动向导)
        if (typeof TourGuide !== 'undefined') {
            this.tourGuide = new TourGuide();
            const tourBtn = document.getElementById('btn-tour-guide');
            if (tourBtn) {
                tourBtn.addEventListener('click', () => this.tourGuide.start());
            }
            if (localStorage.getItem('optipack_tour_seen') !== 'true') {
                setTimeout(() => {
                    this.tourGuide.start();
                }, 800);
            }
        }

        // 绑定更新日志弹窗
        const changelogBtn = document.getElementById('btn-changelog');
        const changelogModal = document.getElementById('changelog-modal');
        const closeChangelogBtn = document.getElementById('btn-close-changelog');
        if (changelogBtn && changelogModal) {
            changelogBtn.addEventListener('click', () => {
                changelogModal.classList.remove('hidden');
            });
            if (closeChangelogBtn) {
                closeChangelogBtn.addEventListener('click', () => {
                    changelogModal.classList.add('hidden');
                });
            }
            changelogModal.addEventListener('click', (e) => {
                if (e.target === changelogModal) {
                    changelogModal.classList.add('hidden');
                }
            });
        }

        // 绑定头部动作
        document.getElementById('btn-load-demo').addEventListener('click', () => {
            this.loadDemoData();
        });
        const importBtn = document.getElementById('btn-import-excel');
        const tooltipCard = document.getElementById('excel-format-tooltip');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                document.getElementById('input-excel-file').click();
            });
            if (tooltipCard) {
                importBtn.addEventListener('mouseenter', () => tooltipCard.classList.add('show-tooltip'));
                importBtn.addEventListener('mouseleave', () => tooltipCard.classList.remove('show-tooltip'));
            }
        }
        document.getElementById('input-excel-file').addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                FileHandler.importFromExcel(e.target.files[0], (imported) => {
                    this.items = imported;
                    this.renderItemsTable();
                    this.runOptimization();
                });
                e.target.value = '';
            }
        });
        document.getElementById('btn-optimize').addEventListener('click', () => {
            this.runOptimization(true);
        });

        // 绑定容器配置面板
        const presetSelect = document.getElementById('preset-container');
        presetSelect.addEventListener('change', (e) => this.handlePresetChange(e.target.value));

        const toggleUniform = document.getElementById('toggle-uniform-reduction');
        const toggleVolume = document.getElementById('toggle-volume-reduction');
        const toggleTransverse = document.getElementById('toggle-transverse-packing');
        if (toggleUniform && toggleVolume) {
            toggleUniform.addEventListener('change', () => {
                if (toggleUniform.checked) toggleVolume.checked = false;
                this.runOptimization();
            });
            toggleVolume.addEventListener('change', () => {
                if (toggleVolume.checked) toggleUniform.checked = false;
                this.runOptimization();
            });
        }
        if (toggleTransverse) {
            toggleTransverse.addEventListener('change', () => this.runOptimization());
        }
        const toggleBox = document.getElementById('toggle-box-mode');
        const toggleCylinder = document.getElementById('toggle-cylinder-mode');
        if (toggleBox && toggleCylinder) {
            toggleBox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    toggleCylinder.checked = false;
                    this.cylinderMode = false;
                } else {
                    toggleCylinder.checked = true;
                    this.cylinderMode = true;
                }
                this.renderItemsTable();
                this.runOptimization();
            });
            toggleCylinder.addEventListener('change', (e) => {
                if (e.target.checked) {
                    toggleBox.checked = false;
                    this.cylinderMode = true;
                } else {
                    toggleBox.checked = true;
                    this.cylinderMode = false;
                }
                this.renderItemsTable();
                this.runOptimization();
            });
        }

        // 绑定面板折叠
        document.getElementById('toggle-container-panel').addEventListener('click', function() {
            const body = this.nextElementSibling;
            const icon = this.querySelector('.toggle-icon');
            if (body.style.display === 'none') {
                body.style.display = 'grid';
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            } else {
                body.style.display = 'none';
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            }
        });

        // 绑定清单表格工具
        document.getElementById('btn-add-item').addEventListener('click', () => this.addNewItemRow());
        document.getElementById('btn-clear-items').addEventListener('click', () => {
            if (confirm('确认清空所有待装货物清单吗？')) {
                this.items = [];
                this.renderItemsTable();
                this.sceneViewer.stop();
                this.resetStats();
            }
        });

        // 绑定 3D 视图与外框切换
        document.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
                const target = e.currentTarget;
                target.classList.add('active');
                this.sceneViewer.setViewMode(target.dataset.view);
            });
        });
        document.getElementById('toggle-wireframe').addEventListener('change', (e) => {
            this.sceneViewer.toggleWireframe(e.target.checked);
        });

        // 绑定回放播放器工具栏
        const slider = document.getElementById('animation-slider');
        slider.addEventListener('input', (e) => {
            this.sceneViewer.goToStep(parseInt(e.target.value, 10));
        });

        document.getElementById('btn-play-pause').addEventListener('click', () => {
            if (this.sceneViewer.isPlaying) {
                this.sceneViewer.pause();
                document.getElementById('btn-play-pause').innerHTML = '<i class="fa-solid fa-play"></i>';
            } else {
                this.sceneViewer.play();
                document.getElementById('btn-play-pause').innerHTML = '<i class="fa-solid fa-pause"></i>';
            }
        });

        document.getElementById('btn-step-prev').addEventListener('click', () => this.sceneViewer.stepPrev());
        document.getElementById('btn-step-next').addEventListener('click', () => this.sceneViewer.stepNext());
        document.getElementById('btn-reset-view').addEventListener('click', () => {
            this.sceneViewer.goToStep(0);
        });

        document.getElementById('playback-speed').addEventListener('change', (e) => {
            this.sceneViewer.setSpeed(parseInt(e.target.value, 10));
        });

        // 绑定成果导出与清单明细查看
        const manifestBtn = document.getElementById('btn-show-manifest');
        if (manifestBtn) manifestBtn.addEventListener('click', () => this.showManifestModal());

        const closeModalBtn = document.getElementById('btn-close-modal');
        if (closeModalBtn) closeModalBtn.addEventListener('click', () => {
            document.getElementById('manifest-modal').classList.add('hidden');
        });

        const repackModalBtn = document.getElementById('btn-repack-modal');
        if (repackModalBtn) repackModalBtn.addEventListener('click', () => {
            document.getElementById('manifest-modal').classList.add('hidden');
            this.runOptimization(true, '🎯 定制数量重装');
        });

        const resetHandler = () => {
            this.items.forEach(item => {
                delete item.locked;
                delete item.targetPacked;
            });
            const toggleEl = document.getElementById('toggle-uniform-reduction');
            if (toggleEl) toggleEl.checked = false;
            const toggleVol = document.getElementById('toggle-volume-reduction');
            if (toggleVol) toggleVol.checked = false;
            const toggleTransverse = document.getElementById('toggle-transverse-packing');
            if (toggleTransverse) toggleTransverse.checked = true;
            this.renderItemsTable();
            document.getElementById('manifest-modal').classList.add('hidden');
            this.runOptimization();
        };
        const resetSidebarBtn = document.getElementById('btn-reset-defaults-sidebar');
        if (resetSidebarBtn) resetSidebarBtn.addEventListener('click', resetHandler);
        const resetModalBtn = document.getElementById('btn-reset-defaults-modal');
        if (resetModalBtn) resetModalBtn.addEventListener('click', resetHandler);

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
                const tab = e.currentTarget.dataset.tab;
                e.currentTarget.classList.add('active');
                document.getElementById(`tab-${tab}`).classList.remove('hidden');
            });
        });

        document.getElementById('btn-export-excel').addEventListener('click', () => {
            if (!this.lastPackingResult) return alert('请先执行智能装箱优化');
            FileHandler.exportToExcel(this.currentContainer, this.lastPackingResult);
        });
        const btnExportPdf = document.getElementById('btn-export-pdf');
        if (btnExportPdf) {
            btnExportPdf.addEventListener('click', () => {
                if (!this.lastPackingResult) return alert('请先执行智能装箱优化');
                FileHandler.exportToPDF(this.currentContainer, this.lastPackingResult, document.getElementById('print-capture-area'));
            });
        }

        // 初始化默认演示数据
        const presetEl = document.getElementById('preset-container');
        if (presetEl) presetEl.value = '40HQ.SPECIAL';
        this.handlePresetChange('40HQ.SPECIAL');
        this.loadDemoData();
    }

    showManifestModal() {
        if (!this.lastPackingResult) return alert('请先执行智能装箱优化');
        const modal = document.getElementById('manifest-modal');
        const packedTbody = document.getElementById('packed-tbody');
        const unpackedTbody = document.getElementById('unpacked-tbody');
        packedTbody.innerHTML = '';
        unpackedTbody.innerHTML = '';

        const res = this.lastPackingResult;
        const packedList = res.packedItems || [];
        const unpackedList = res.unpackedItems || [];

        // 1. 建立各尺寸规格的完整详单地图
        const sizeMap = new Map();
        this.items.forEach((item, itemIdx) => {
            const fullName = item.name ? String(item.name).trim() : '货物';
            const key = `${fullName}_${item.width}x${item.height}x${item.length}`;
            if (!sizeMap.has(key)) {
                sizeMap.set(key, {
                    key: key,
                    name: fullName,
                    color: item.color || '#38bdf8',
                    width: item.width,
                    height: item.height,
                    length: item.length,
                    weight: item.weight,
                    planned: 0,
                    packed: 0,
                    unpacked: 0,
                    locked: Boolean(item.locked),
                    targetPacked: item.targetPacked,
                    itemIndices: []
                });
            }
            const g = sizeMap.get(key);
            g.planned += item.quantity;
            g.itemIndices.push(itemIdx);
            if (item.locked) {
                g.locked = true;
                if (item.targetPacked !== undefined) g.targetPacked = item.targetPacked;
            }
        });

        // 统计实际放入
        packedList.forEach(item => {
            const fullName = item.name ? String(item.name).trim() : '货物';
            const key = `${fullName}_${item.width}x${item.height}x${item.length}`;
            if (sizeMap.has(key)) {
                sizeMap.get(key).packed += 1;
            } else {
                sizeMap.set(key, {
                    key: key, name: fullName, color: item.color || '#38bdf8', width: item.width, height: item.height, length: item.length, weight: item.weight, planned: 1, packed: 1, unpacked: 0, locked: false, itemIndices: [], shape: item.shape || (this.cylinderMode ? 'cylinder' : 'box')
                });
            }
        });

        // 统计未放入
        unpackedList.forEach(item => {
            const fullName = item.name ? String(item.name).trim() : '货物';
            const key = `${fullName}_${item.width}x${item.height}x${item.length}`;
            if (sizeMap.has(key)) {
                sizeMap.get(key).unpacked += 1;
            }
        });

        document.getElementById('modal-packed-cnt').innerText = sizeMap.size;
        document.getElementById('modal-unpacked-cnt').innerText = unpackedList.length;

        Array.from(sizeMap.values()).forEach((group, idx) => {
            const currentPackedVal = (group.locked && group.targetPacked !== undefined) ? group.targetPacked : group.packed;
            const currentUnpackedVal = group.unpacked;

            let statusBadge = `<span class="status-badge" style="display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.2);color:#10b981;font-weight:bold;font-size:0.85rem;">全部装入 ✅</span>`;
            if (group.packed === 0) {
                statusBadge = `<span class="status-badge" style="display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.2);color:#ef4444;font-weight:bold;font-size:0.85rem;">未能装入 ❌</span>`;
            } else if (group.unpacked > 0) {
                statusBadge = `<span class="status-badge" style="display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(245,158,11,0.2);color:#f59e0b;font-weight:bold;font-size:0.85rem;">部分装入 ⚠️</span>`;
            }

            const borderStyle = group.locked ? 'border: 2px solid #38bdf8; background: rgba(56, 189, 248, 0.25); color: #fff;' : 'border: 1px solid rgba(255,255,255,0.2); background: rgba(15,23,42,0.6); color: #e2e8f0;';
            const lockBadge = group.locked ? `<span class="lock-indicator"><i class="fa-solid fa-lock text-accent" title="已锁定为精准个数，不参与数量/体积递减"></i></span>` : `<span class="lock-indicator"></span>`;
            const dimDisplay = (group.shape === 'cylinder' || this.cylinderMode) ? `Φ${group.width} × L${group.length}` : `${group.width}×${group.height}×${group.length}`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${group.color};vertical-align:middle;"></span></td>
                <td class="font-mono font-bold" style="font-size:1.05rem;">${group.name}</td>
                <td class="font-mono">${dimDisplay}</td>
                <td>${group.weight}</td>
                <td class="font-bold" style="font-size:1.05rem; color:#cbd5e1;">${group.planned}</td>
                <td>
                    <div style="display:flex; align-items:center; justify-content:center; gap:5px;">
                        <button class="btn-icon modal-q-btn modal-minus-btn" data-key="${group.key}" data-delta="-1" style="width:26px; height:26px; border:1px solid rgba(255,255,255,0.2); border-radius:4px; background:rgba(255,255,255,0.08); cursor:${currentPackedVal <= 0 ? 'not-allowed' : 'pointer'}; opacity:${currentPackedVal <= 0 ? '0.3' : '1'}; font-weight:bold;" ${currentPackedVal <= 0 ? 'disabled' : ''}>-</button>
                        <input type="number" class="table-input font-mono modal-q-input" style="width:65px; text-align:center; font-weight:bold; font-size:1rem; border-radius:4px; padding:2px; ${borderStyle}" value="${currentPackedVal}" data-key="${group.key}" min="0" max="${group.planned}" />
                        <button class="btn-icon modal-q-btn modal-plus-btn" data-key="${group.key}" data-delta="1" style="width:26px; height:26px; border:1px solid rgba(255,255,255,0.2); border-radius:4px; background:rgba(255,255,255,0.08); cursor:${currentPackedVal >= group.planned ? 'not-allowed' : 'pointer'}; opacity:${currentPackedVal >= group.planned ? '0.3' : '1'}; font-weight:bold;" ${currentPackedVal >= group.planned ? 'disabled' : ''}>+</button>
                        ${lockBadge}
                    </div>
                </td>
                <td class="font-bold modal-unpacked-cell" data-key="${group.key}" style="color:#ef4444; font-size:1.15rem;">${currentUnpackedVal}</td>
                <td class="modal-status-cell" data-key="${group.key}">${statusBadge}</td>
            `;
            packedTbody.appendChild(tr);
        });

        const updateGroupPacked = (key, newPacked) => {
            const g = sizeMap.get(key);
            if (!g || !g.itemIndices.length) return;
            newPacked = Math.min(g.planned, Math.max(0, parseInt(newPacked, 10) || 0));
            g.targetPacked = newPacked;
            g.locked = true;

            if (g.itemIndices.length === 1) {
                const idx = g.itemIndices[0];
                this.items[idx].targetPacked = newPacked;
                this.items[idx].locked = true;
            } else {
                let rem = newPacked;
                g.itemIndices.forEach((idx, i) => {
                    const assign = (i === g.itemIndices.length - 1) ? rem : Math.min(this.items[idx].quantity || 1, rem);
                    this.items[idx].targetPacked = assign;
                    this.items[idx].locked = true;
                    rem = Math.max(0, rem - assign);
                });
            }

            const inputEl = packedTbody.querySelector(`.modal-q-input[data-key="${key}"]`);
            if (inputEl) {
                inputEl.value = newPacked;
                inputEl.style.border = '2px solid #38bdf8';
                inputEl.style.background = 'rgba(56, 189, 248, 0.25)';
                inputEl.style.color = '#fff';
                const lockContainer = inputEl.parentNode.querySelector('.lock-indicator');
                if (lockContainer && !lockContainer.innerHTML.includes('fa-lock')) {
                    lockContainer.innerHTML = `<i class="fa-solid fa-lock text-accent" title="已锁定为精准个数，不参与数量/体积递减"></i>`;
                }
            }
            const minusBtn = packedTbody.querySelector(`.modal-minus-btn[data-key="${key}"]`);
            if (minusBtn) {
                minusBtn.disabled = (newPacked <= 0);
                minusBtn.style.opacity = (newPacked <= 0) ? '0.3' : '1';
                minusBtn.style.cursor = (newPacked <= 0) ? 'not-allowed' : 'pointer';
            }
            const plusBtn = packedTbody.querySelector(`.modal-plus-btn[data-key="${key}"]`);
            if (plusBtn) {
                plusBtn.disabled = (newPacked >= g.planned);
                plusBtn.style.opacity = (newPacked >= g.planned) ? '0.3' : '1';
                plusBtn.style.cursor = (newPacked >= g.planned) ? 'not-allowed' : 'pointer';
            }
            const unpackedCell = packedTbody.querySelector(`.modal-unpacked-cell[data-key="${key}"]`);
            const unp = Math.max(0, g.planned - newPacked);
            if (unpackedCell) unpackedCell.innerText = unp;

            const statusCell = packedTbody.querySelector(`.modal-status-cell[data-key="${key}"]`);
            if (statusCell) {
                if (newPacked === 0) {
                    statusCell.innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.2);color:#ef4444;font-weight:bold;font-size:0.85rem;">未能装入 ❌</span>`;
                } else if (unp > 0) {
                    statusCell.innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(245,158,11,0.2);color:#f59e0b;font-weight:bold;font-size:0.85rem;">部分装入 ⚠️</span>`;
                } else {
                    statusCell.innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.2);color:#10b981;font-weight:bold;font-size:0.85rem;">全部装入 ✅</span>`;
                }
            }
        };

        packedTbody.querySelectorAll('.modal-q-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.currentTarget.dataset.key;
                const delta = parseInt(e.currentTarget.dataset.delta, 10);
                const g = sizeMap.get(key);
                if (g) {
                    const cur = (g.locked && g.targetPacked !== undefined) ? g.targetPacked : g.packed;
                    updateGroupPacked(key, cur + delta);
                }
            });
        });

        packedTbody.querySelectorAll('.modal-q-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const key = e.currentTarget.dataset.key;
                updateGroupPacked(key, e.currentTarget.value);
            });
        });

        // 对未放入清单按“物品名称 + 规格尺寸 + 原因”进行汇总统计
        const unpackedMap = new Map();
        unpackedList.forEach(item => {
            const fullName = item.name ? String(item.name).trim() : '货物';
            const reason = item.reason || '容器空间或承重限制超标';
            const key = `${fullName}_${item.width}x${item.height}x${item.length}_${reason}`;
            if (!unpackedMap.has(key)) {
                unpackedMap.set(key, {
                    name: fullName,
                    width: item.width,
                    height: item.height,
                    length: item.length,
                    weight: item.weight,
                    reason: reason,
                    count: 0
                });
            }
            unpackedMap.get(key).count += 1;
        });

        Array.from(unpackedMap.values()).forEach((group, idx) => {
            const dimDisplay = this.cylinderMode ? `Φ${group.width} × L${group.length}` : `${group.width}×${group.height}×${group.length}`;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td class="font-mono font-bold text-danger" style="font-size:1.05rem;">${group.name}</td>
                <td>${dimDisplay}</td>
                <td>${group.weight}</td>
                <td class="text-danger font-bold" style="font-size:1.15rem;">${group.count} 件</td>
                <td class="text-warning">${group.reason}</td>
            `;
            unpackedTbody.appendChild(tr);
        });

        modal.classList.remove('hidden');
    }

    handlePresetChange(val) {
        if (PRESET_CONTAINERS[val]) {
            const p = PRESET_CONTAINERS[val];
            document.getElementById('container-length').value = p.l;
            document.getElementById('container-width').value = p.w;
            document.getElementById('container-height').value = p.h;
            document.getElementById('container-max-weight').value = p.maxW;
        }
    }

    loadDemoData() {
        this.items = [
            { id: 'item_1', name: '工业电机整机箱', length: 1200, width: 800, height: 900, weight: 250, quantity: 8, rotatable: true, color: '#6366f1' },
            { id: 'item_2', name: '精密仪器防震装', length: 800, width: 600, height: 600, weight: 45, quantity: 16, rotatable: true, color: '#38bdf8' },
            { id: 'item_3', name: '标准零件塑料箱A', length: 600, width: 400, height: 300, weight: 25, quantity: 42, rotatable: true, color: '#10b981' },
            { id: 'item_4', name: '大型管材木箱', length: 2200, width: 400, height: 400, weight: 120, quantity: 6, rotatable: false, color: '#f59e0b' },
            { id: 'item_5', name: '五金辅料纸箱', length: 400, width: 300, height: 250, weight: 15, quantity: 60, rotatable: true, color: '#ec4899' }
        ];
        this.renderItemsTable();
        this.runOptimization();
    }

    addNewItemRow() {
        const hue = Math.floor(Math.random() * 360);
        this.items.push({
            id: `item_${Date.now()}`,
            name: `新物品_${this.items.length + 1}`,
            length: 500,
            width: 400,
            height: 300,
            weight: 20,
            quantity: 10,
            rotatable: true,
            color: `hsl(${hue}, 75%, 60%)`
        });
        this.renderItemsTable();
        // 自动滚动到表格底部
        const scrollElem = document.querySelector('.table-scroll-container');
        if (scrollElem) scrollElem.scrollTop = scrollElem.scrollHeight;
    }

    renderItemsTable() {
        const tbody = document.getElementById('items-tbody');
        tbody.innerHTML = '';
        document.getElementById('item-count-badge').innerText = this.items.length;

        const thDim = document.getElementById('th-dimensions');
        if (thDim) {
            thDim.innerText = this.cylinderMode ? '尺寸 (直径D × 长度L mm)' : '尺寸 (W×H×L mm)';
        }

        this.items.forEach((item, index) => {
            let dimHtml = '';
            if (this.cylinderMode) {
                item.diameter = item.diameter || item.width || 500;
                item.width = item.diameter;
                item.height = item.diameter;
                item.shape = 'cylinder';
                item.isCylinder = true;
                dimHtml = `
                    <div class="dim-inputs font-mono" style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <span style="color:#38bdf8;font-weight:bold;">Φ</span><input type="number" class="table-input" style="width:70px;" value="${item.diameter}" data-field="diameter" data-idx="${index}" title="圆柱体直径 D (mm)" />
                        <span style="color:#64748b;">× L:</span><input type="number" class="table-input" style="width:70px;" value="${item.length}" data-field="length" data-idx="${index}" title="圆柱体长度 L (mm)" />
                    </div>
                `;
            } else {
                if (item.shape === 'cylinder') {
                    delete item.shape;
                    delete item.isCylinder;
                }
                dimHtml = `
                    <div class="dim-inputs font-mono">
                        <input type="number" class="table-input" value="${item.width}" data-field="width" data-idx="${index}" title="宽度 W" />×
                        <input type="number" class="table-input" value="${item.height}" data-field="height" data-idx="${index}" title="高度 H" />×
                        <input type="number" class="table-input" value="${item.length}" data-field="length" data-idx="${index}" title="长度 L" />
                    </div>
                `;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-mono text-secondary">${index + 1}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <input type="color" class="item-color-picker" value="${this.hslToHexOrKeep(item.color)}" data-idx="${index}" />
                        <input type="text" class="table-input" style="width: 80px;" value="${item.name}" data-field="name" data-idx="${index}" />
                    </div>
                </td>
                <td>
                    ${dimHtml}
                </td>
                <td><input type="number" class="table-input font-mono text-accent" style="width: 50px; font-weight:bold;" value="${item.quantity}" data-field="quantity" data-idx="${index}" /></td>
                <td><input type="number" class="table-input font-mono" style="width: 55px;" value="${item.weight}" data-field="weight" data-idx="${index}" /></td>
                <td style="text-align: center;"><input type="checkbox" ${item.rotatable ? 'checked' : ''} data-field="rotatable" data-idx="${index}" /></td>
                <td style="text-align: center;"><button class="btn-icon text-danger btn-del-row" data-idx="${index}"><i class="fa-solid fa-xmark"></i></button></td>
            `;
            tbody.appendChild(tr);
        });

        // 绑定实时输入监听（采用 input 事件确保用户敲击键盘瞬间即刻同步内存数据，解决直接点击优化或新增时输入内容丢失的问题）
        tbody.querySelectorAll('input').forEach(input => {
            const field = input.dataset.field;
            const eventType = (input.type === 'checkbox' || input.type === 'color') ? 'change' : 'input';

            input.addEventListener(eventType, (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                if (!this.items[idx]) return;

                if (field === 'quantity') {
                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                    this.items[idx][field] = val;
                    delete this.items[idx].targetPacked;
                    delete this.items[idx].locked;
                } else if (field === 'diameter') {
                    const val = Math.max(1, parseFloat(e.target.value) || 1);
                    this.items[idx].diameter = val;
                    this.items[idx].width = val;
                    this.items[idx].height = val;
                } else if (field === 'width' || field === 'height') {
                    const val = Math.max(1, parseFloat(e.target.value) || 1);
                    this.items[idx][field] = val;
                    if (this.cylinderMode) {
                        this.items[idx].diameter = val;
                        this.items[idx].width = val;
                        this.items[idx].height = val;
                    }
                } else {
                    if (field === 'rotatable') {
                        this.items[idx][field] = e.target.checked;
                    } else if (e.target.type === 'color') {
                        this.items[idx].color = e.target.value;
                    } else if (field === 'name') {
                        this.items[idx][field] = e.target.value;
                    } else {
                        this.items[idx][field] = Math.max(1, parseFloat(e.target.value) || 1);
                    }
                }
            });
        });

        tbody.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.idx, 10);
                this.items.splice(idx, 1);
                this.renderItemsTable();
            });
        });
    }

    runOptimization(isManualTrigger = false) {
        if (this.items.length === 0) {
            if (isManualTrigger === true) {
                alert('请先添加待装物品清单');
            } else {
                if (this.sceneViewer && this.currentContainer) {
                    this.sceneViewer.renderPackingScene(this.currentContainer, []);
                }
                this.updateStatsBoard({
                    totalCount: 0,
                    unpackedCount: 0,
                    totalWeight: 0,
                    volumeUtilization: 0,
                    weightUtilization: 0
                });
            }
            return;
        }

        const presetKey = document.getElementById('preset-container').value;
        this.currentContainer = {
            presetName: PRESET_CONTAINERS[presetKey] ? PRESET_CONTAINERS[presetKey].name : '自定义规格',
            length: parseFloat(document.getElementById('container-length').value) || 12032,
            width: parseFloat(document.getElementById('container-width').value) || 2352,
            height: parseFloat(document.getElementById('container-height').value) || 2698,
            maxWeight: parseFloat(document.getElementById('container-max-weight').value) || 28800
        };

        // 执行算法前：智能规范化后缀命名（如 model1 下不同尺寸自动变成 model1.1, model1.2）
        const nameGroups = {};
        this.items.forEach(item => {
            let base = item.name ? String(item.name).trim() : '货物';
            if (base.match(/\.\d+$/)) base = base.replace(/\.\d+$/, '');
            const sig = `${item.width}x${item.height}x${item.length}`;
            if (!nameGroups[base]) nameGroups[base] = {};
            let sub = nameGroups[base][sig];
            if (!sub) {
                sub = Object.keys(nameGroups[base]).length + 1;
                nameGroups[base][sig] = sub;
            }
            item.name = `${base}.${sub}`;
        });

        const uniformReduction = document.getElementById('toggle-uniform-reduction')?.checked || false;
        const volumeReduction = document.getElementById('toggle-volume-reduction')?.checked || false;
        const transversePacking = document.getElementById('toggle-transverse-packing')?.checked || false;
        const verticalPacking = transversePacking; // 统一通过“柜门横竖填充”组合开关控制横向与竖向算法阶段
        const cylinderMode = this.cylinderMode || document.getElementById('toggle-cylinder-mode')?.checked || false;
        const result = this.engine.pack(this.currentContainer, this.items, { uniformReduction, volumeReduction, transversePacking, verticalPacking, cylinderMode });
        this.lastPackingResult = result;
        this.renderItemsTable(); // 同步刷新左侧清单表格里输入框前的颜色块

        // 更新仪表盘看板
        this.updateStatsBoard(result.stats);

        // 溢出告警与全部成功装入提示 Toast
        const overflowToast = document.getElementById('overflow-toast');
        const successToast = document.getElementById('success-toast');
        if (result.stats.unpackedCount > 0) {
            document.getElementById('overflow-count').innerText = result.stats.unpackedCount;
            if (overflowToast) overflowToast.classList.remove('hidden');
            if (successToast) successToast.classList.add('hidden');
        } else if (result.stats.totalCount > 0) {
            const successCountEl = document.getElementById('success-count');
            if (successCountEl) successCountEl.innerText = result.stats.totalCount;
            if (successToast) successToast.classList.remove('hidden');
            if (overflowToast) overflowToast.classList.add('hidden');
        } else {
            if (overflowToast) overflowToast.classList.add('hidden');
            if (successToast) successToast.classList.add('hidden');
        }

        // 驱动 3D 场景与播放器
        this.sceneViewer.renderPackingScene(this.currentContainer, result.packedItems, (cur, total, isPlaying) => {
            const slider = document.getElementById('animation-slider');
            slider.max = total;
            slider.value = cur;
            slider.disabled = total === 0;
            document.getElementById('step-counter').innerText = `${cur} / ${total}`;
            
            const playBtn = document.getElementById('btn-play-pause');
            playBtn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
        });
    }

    updateStatsBoard(stats) {
        document.getElementById('stat-utilization').innerText = `${stats.utilizationPercentage}%`;
        document.getElementById('utilization-progress').style.width = `${stats.utilizationPercentage}%`;
        document.getElementById('stat-volume').innerText = `${stats.packedVolume} / ${stats.totalContainerVolume} m³`;
        document.getElementById('stat-weight').innerText = `${stats.totalWeight} / ${stats.maxWeight} kg`;
        document.getElementById('stat-items').innerText = `${stats.packedCount} / ${stats.totalCount}`;
    }

    resetStats() {
        document.getElementById('stat-utilization').innerText = `0.0%`;
        document.getElementById('utilization-progress').style.width = `0%`;
        document.getElementById('stat-volume').innerText = `0 / 0 m³`;
        document.getElementById('stat-weight').innerText = `0 / 0 kg`;
        document.getElementById('stat-items').innerText = `0 / 0`;
        const overflowToast = document.getElementById('overflow-toast');
        if (overflowToast) overflowToast.classList.add('hidden');
        const successToast = document.getElementById('success-toast');
        if (successToast) successToast.classList.add('hidden');
    }

    handleItemHover(item) {
        const tooltip = document.getElementById('item-tooltip');
        if (!item) {
            tooltip.classList.add('hidden');
            return;
        }

        document.getElementById('tooltip-color-indicator').style.backgroundColor = item.color || '#38bdf8';
        document.getElementById('tooltip-title').innerText = item.name;
        document.getElementById('tooltip-step').innerText = `#${item.stepIndex}`;
        document.getElementById('tooltip-dim').innerText = `${item.length}×${item.width}×${item.height} mm`;
        document.getElementById('tooltip-weight').innerText = `${item.weight} kg`;
        document.getElementById('tooltip-coord').innerText = `(${item.x}, ${item.y}, ${item.z})`;
        tooltip.classList.remove('hidden');
    }

    hslToHexOrKeep(str) {
        if (!str) return '#38bdf8';
        if (str.startsWith('#')) return str;
        
        const m = String(str).match(/hsl\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)%?,\s*(\d+(?:\.\d+)?)%?\)/i);
        if (!m) return '#38bdf8';

        let h = parseFloat(m[1]);
        let s = parseFloat(m[2]) / 100;
        let l = parseFloat(m[3]) / 100;

        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }
}

// 启动应用
window.addEventListener('DOMContentLoaded', () => {
    new AppController();
});
