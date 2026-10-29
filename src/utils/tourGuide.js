/**
 * OptiPack 3D - Interactive Spotlight Guided Tour (严格对应图示 1-10 顺序 & 4分块零遮挡纯净镂空版)
 * Version: v=20260713_VER1_2
 */

class TourGuide {
    constructor() {
        this.currentStep = 0;
        this.isActive = false;
        // 严格按照图示 1-10 顺序对应左侧、顶部、中央与底部各大核心按键功能
        this.steps = [
            {
                selector: '.sidebar section:first-child',
                placement: 'right',
                padding: 10,
                title: '<i class="fa-solid fa-truck-container text-cyan"></i> 1. 容器空间设置',
                content: '这里是装箱的起始点。您可在预设下拉框中选择 12 种常见标准集装箱（如 20GP / 40HQ / 特殊厢车等），或在下方输入框中精细自定义货柜的内部净宽、净高、净长及最大承重限额。'
            },
            {
                selector: '.sidebar section:nth-child(2)',
                placement: 'right',
                padding: 10,
                title: '<i class="fa-solid fa-boxes-stacked text-purple"></i> 2. 待装货物清单与规格管理',
                content: '在此录入和管理所有待装包裹规格。点击右上角 [+] 号可录入新箱型，直接修改表格内容即可实时调整单件重量、数量及是否允许倒置（防转）。点击最右侧 [×] 快速删除。'
            },
            {
                selector: '#btn-changelog',
                placement: 'bottom',
                padding: 8,
                title: '<i class="fa-solid fa-clock-rotate-left" style="color: #cbd5e1;"></i> 3. 实时探索版本迭代更新日志',
                content: '点击紧挨着新手导览的【更新日志】按键，即可随时展开弹窗查看本系统的全部历史版本与功能迭代脉络（如 Ver 1.2 物理重力沉降与两点嵌套算法等）！'
            },
            {
                selector: '#btn-import-excel',
                placement: 'bottom',
                padding: 8,
                title: '<i class="fa-solid fa-file-excel text-success"></i> 4. Excel 批量导入清单',
                content: '日常业务中无需逐条手动录入！点击此按钮选择包含「型号、长×宽×高、数量」的 Excel 或 CSV 报表文件，系统即可一键解析并全自动填充左侧待装清单！'
            },
            {
                selector: '#btn-optimize',
                placement: 'bottom',
                padding: 10,
                title: '<i class="fa-solid fa-microchip text-accent"></i> 5. 智能一键装箱优化',
                content: '核心运筹算法开关！在左侧配置好容器与货物清单后，点击上方这枚发光的主按键，先进的三维空间排布引擎将在数毫秒内为您极速算出最优多层装箱堆叠方案！'
            },
            {
                selector: '.stats-dashboard',
                placement: 'bottom',
                padding: 12,
                title: '<i class="fa-solid fa-gauge-high text-cyan"></i> 6. 实时监控看板与状态提示',
                content: '顶部驾驶舱实时展示本轮装箱的「总体利用率」、「占用体积/总容量」、「承重比」与「已装件数/总件数」。当货物超出极限时右侧自动弹出红色溢出告警，全部装下则显示绿色成功提示！'
            },
            {
                selector: '.canvas-wrapper',
                placement: 'top',
                padding: 6,
                title: '<i class="fa-solid fa-cube text-purple"></i> 7. 3D 全景可视化交互与回放',
                content: '中央 3D 视窗为您 1:1 还原货箱内部。鼠标【左键拖拽】可 360° 旋转观察，【右键拖拽】平移、【滚轮】缩放。您还可拉动底部动画进度条，像看电影一般逐件回放码放过程！'
            },
            {
                selector: '.sidebar section:nth-child(3)',
                placement: 'top',
                padding: 10,
                title: '<i class="fa-solid fa-sliders text-warning"></i> 8. 装箱算法规则与“圆柱/长方”双擎配置',
                content: '底部策略控制区：支持「长方体 / 圆柱体」双模态无缝切换！切换至圆柱体时自动激活物理重力滚动模拟与倒三角巢点自适应沉降增容计算；同时支持勾选「数量/体积递减」与「横竖填充」防滚落安全竖放策略！'
            },
            {
                selector: '#btn-show-manifest',
                placement: 'top',
                padding: 8,
                title: '<i class="fa-solid fa-clipboard-list text-accent"></i> 9. 查看装箱明细与封顶锁单',
                content: '点击此按键可展开完整装箱作业明细弹窗。在弹窗中不仅能精确查对放入/未放入汇总，还可通过 + / - 号对任意规格进行「独立锁单封顶」并重新算单，实现人机协同微调！'
            },
            {
                selector: '#btn-export-excel',
                placement: 'top',
                padding: 8,
                title: '<i class="fa-solid fa-file-export text-success"></i> 10. 导出 Excel 排布明细报表',
                content: '装箱方案确认满意后，点击此处的【导出Excel明细】即可生成包含每个包裹 3D 坐标位置与尺寸汇总的专业物流交接表，方便现场装卸工直接按图按表施工作业！'
            }
        ];
        this.initDOM();
    }

    initDOM() {
        if (document.getElementById('tour-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'tour-overlay';
        overlay.className = 'tour-overlay hidden';
        overlay.innerHTML = `
            <!-- 采用 4 分块纯净拼合遮罩，目标区域为 100% 绝对真空，彻底杜绝模糊或遮挡 -->
            <div id="tour-mask-top" class="tour-mask"></div>
            <div id="tour-mask-bottom" class="tour-mask"></div>
            <div id="tour-mask-left" class="tour-mask"></div>
            <div id="tour-mask-right" class="tour-mask"></div>
            <div id="tour-spotlight-frame" class="tour-spotlight-frame"></div>

            <div id="tour-tooltip" class="tour-tooltip glass-panel">
                <div class="tour-header">
                    <h3 id="tour-title" class="tour-title"><i class="fa-solid fa-compass-drafting text-cyan"></i> <span>第一步</span></h3>
                    <span id="tour-step-badge" class="tour-step-badge">1 / 9</span>
                </div>
                <div id="tour-body" class="tour-body"></div>
                <div class="tour-footer">
                    <button id="tour-btn-skip" class="btn btn-skip">跳过向导</button>
                    <div class="tour-nav-btns">
                        <button id="tour-btn-prev" class="btn btn-prev"><i class="fa-solid fa-arrow-left"></i> 上一步</button>
                        <button id="tour-btn-next" class="btn btn-next font-bold">下一步 <i class="fa-solid fa-arrow-right"></i></button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('tour-btn-skip').addEventListener('click', () => this.endTour());
        document.getElementById('tour-btn-prev').addEventListener('click', () => this.prevStep());
        document.getElementById('tour-btn-next').addEventListener('click', () => this.nextStep());

        window.addEventListener('resize', () => {
            if (this.isActive) this.renderStep(this.currentStep);
        });
    }

    start() {
        this.currentStep = 0;
        this.isActive = true;
        const overlay = document.getElementById('tour-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            setTimeout(() => {
                this.renderStep(0);
            }, 50);
        }
    }

    renderStep(index) {
        if (index < 0 || index >= this.steps.length) return;
        this.currentStep = index;
        const step = this.steps[index];

        const tooltip = document.getElementById('tour-tooltip');
        const titleEl = document.getElementById('tour-title');
        const bodyEl = document.getElementById('tour-body');
        const badgeEl = document.getElementById('tour-step-badge');
        const prevBtn = document.getElementById('tour-btn-prev');
        const nextBtn = document.getElementById('tour-btn-next');

        const maskTop = document.getElementById('tour-mask-top');
        const maskBottom = document.getElementById('tour-mask-bottom');
        const maskLeft = document.getElementById('tour-mask-left');
        const maskRight = document.getElementById('tour-mask-right');
        const frame = document.getElementById('tour-spotlight-frame');

        if (!tooltip || !maskTop) return;

        titleEl.innerHTML = step.title;
        bodyEl.innerHTML = step.content;
        badgeEl.innerText = `${index + 1} / ${this.steps.length}`;

        prevBtn.style.display = index === 0 ? 'none' : 'inline-flex';
        if (index === this.steps.length - 1) {
            nextBtn.innerHTML = `完成并立即使用 <i class="fa-solid fa-check"></i>`;
            nextBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        } else {
            nextBtn.innerHTML = `下一步 <i class="fa-solid fa-arrow-right"></i>`;
            nextBtn.style.background = 'linear-gradient(135deg, #0284c7, #38bdf8)';
        }

        const targetEl = document.querySelector(step.selector);
        if (targetEl) {
            const rect = targetEl.getBoundingClientRect();
            const pad = step.padding || 8;

            const left = Math.max(0, rect.left - pad);
            const top = Math.max(0, rect.top - pad);
            const right = Math.min(window.innerWidth, rect.right + pad);
            const bottom = Math.min(window.innerHeight, rect.bottom + pad);

            // 定位 4 大四周遮罩，确保正中间目标框为完全真空
            maskTop.style.top = '0px';
            maskTop.style.left = '0px';
            maskTop.style.width = '100vw';
            maskTop.style.height = `${top}px`;

            maskBottom.style.top = `${bottom}px`;
            maskBottom.style.left = '0px';
            maskBottom.style.width = '100vw';
            maskBottom.style.height = `${Math.max(0, window.innerHeight - bottom)}px`;

            maskLeft.style.top = `${top}px`;
            maskLeft.style.left = '0px';
            maskLeft.style.width = `${left}px`;
            maskLeft.style.height = `${bottom - top}px`;

            maskRight.style.top = `${top}px`;
            maskRight.style.left = `${right}px`;
            maskRight.style.width = `${Math.max(0, window.innerWidth - right)}px`;
            maskRight.style.height = `${bottom - top}px`;

            // 定位外框发光环
            frame.style.top = `${top}px`;
            frame.style.left = `${left}px`;
            frame.style.width = `${right - left}px`;
            frame.style.height = `${bottom - top}px`;
            frame.style.display = 'block';

            // 气泡定位计算
            tooltip.style.transform = 'none';
            const tooltipWidth = 420;
            const tooltipHeight = 220;

            if (step.placement === 'bottom') {
                let leftPos = rect.left + rect.width / 2 - tooltipWidth / 2;
                leftPos = Math.max(20, Math.min(leftPos, window.innerWidth - tooltipWidth - 20));
                tooltip.style.left = `${leftPos}px`;
                tooltip.style.top = `${bottom + 14}px`;
            } else if (step.placement === 'top') {
                let leftPos = rect.left + rect.width / 2 - tooltipWidth / 2;
                leftPos = Math.max(20, Math.min(leftPos, window.innerWidth - tooltipWidth - 20));
                tooltip.style.left = `${leftPos}px`;
                tooltip.style.top = `${Math.max(20, top - tooltipHeight - 14)}px`;
            } else if (step.placement === 'right') {
                tooltip.style.left = `${right + 14}px`;
                let topPos = rect.top;
                topPos = Math.max(20, Math.min(topPos, window.innerHeight - tooltipHeight - 20));
                tooltip.style.top = `${topPos}px`;
            } else if (step.placement === 'left') {
                tooltip.style.left = `${Math.max(20, left - tooltipWidth - 14)}px`;
                let topPos = rect.top;
                topPos = Math.max(20, Math.min(topPos, window.innerHeight - tooltipHeight - 20));
                tooltip.style.top = `${topPos}px`;
            }
        } else {
            maskTop.style.height = '100vh';
            maskBottom.style.height = '0px';
            maskLeft.style.width = '0px';
            maskRight.style.width = '0px';
            frame.style.display = 'none';

            tooltip.style.top = '50%';
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
        }
    }

    prevStep() {
        if (this.currentStep > 0) {
            this.renderStep(this.currentStep - 1);
        }
    }

    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.renderStep(this.currentStep + 1);
        } else {
            this.endTour();
        }
    }

    endTour() {
        this.isActive = false;
        try {
            localStorage.setItem('optipack_tour_seen', 'true');
        } catch (e) {}

        const overlay = document.getElementById('tour-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }
}

if (typeof window !== 'undefined') {
    window.TourGuide = TourGuide;
}
