/**
 * 3D Bin Packing Algorithm Engine (Extreme Point Heuristic)
 * 支持多方向旋转、重力底层优先、空间利用率最大化
 */

class BinPackingEngine {
    constructor() {
        this.container = null;
        this.items = [];
        this.packedItems = [];
        this.unpackedItems = [];
        this.extremePoints = [];
    }

    /**
     * 执行装箱优化计算
     * @param {Object} container - { length, width, height, maxWeight }
     * @param {Array} itemsList - Array of { id, name, length, width, height, weight, quantity, rotatable, color }
     */
    pack(container, itemsList, options = {}) {
        this.container = container;
        this.packedItems = [];
        this.unpackedItems = [];
        this.extremePoints = [{ x: 0, y: 0, z: 0 }];

        // 0. 自动根据每个不同尺寸规格(W×H×L)赋予不同的专属鲜艳色彩（直接输出标准HEX码，确保3D与Excel同色）
        const hslToHexHelper = (h, s, l) => {
            l /= 100;
            const a = s * Math.min(l, 1 - l) / 100;
            const f = n => {
                const k = (n + h / 30) % 12;
                const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
                return Math.round(255 * color).toString(16).padStart(2, '0');
            };
            return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
        };

        const sizeColorMap = {};
        let colorCounter = 0;
        itemsList.forEach(item => {
            const specSignature = `${item.width}x${item.height}x${item.length}`;
            if (!sizeColorMap[specSignature]) {
                const hue = Math.floor((colorCounter * 137.508) % 360);
                sizeColorMap[specSignature] = hslToHexHelper(hue, 80, 55);
                colorCounter++;
            }
            item.color = sizeColorMap[specSignature];
        });

        // 0.5 处理独立精准个数装箱锁定 (无论是否开启均匀递减)
        let preprocessedList = [];
        let lockCutList = [];
        itemsList.forEach(item => {
            const origQ = item.quantity || 1;
            if (item.locked && item.targetPacked !== undefined) {
                const targetQ = Math.max(0, parseInt(item.targetPacked, 10) || 0);
                const cutQ = origQ - targetQ;
                if (cutQ > 0) {
                    for (let c = 0; c < cutQ; c++) {
                        lockCutList.push({
                            ...item,
                            uid: `${item.id || item.name}_lockcut_${c + 1}`,
                            volume: item.length * item.width * item.height,
                            reason: '手动设定放入件数：精准独立装箱剔除'
                        });
                    }
                }
                if (targetQ > 0) {
                    preprocessedList.push({ ...item, quantity: targetQ });
                }
            } else {
                preprocessedList.push({ ...item });
            }
        });

        if (options && options.cylinderMode) {
            return this.packAsCylinders(container, preprocessedList, lockCutList, options);
        }

        // 数量/体积递减装箱判断逻辑：权衡数量与体积总和，若超载则按数量或体积比例均匀削减
        let effectiveItemsList = preprocessedList;
        if (options && (options.uniformReduction || options.volumeReduction)) {
            let lockedVol = 0;
            let lockedWeight = 0;
            let unlockedVol = 0;
            let unlockedWeight = 0;

            preprocessedList.forEach(item => {
                const q = item.quantity || 1;
                const vol = (item.length * item.width * item.height) * q;
                const w = (item.weight || 0) * q;
                if (item.locked) {
                    lockedVol += vol;
                    lockedWeight += w;
                } else {
                    unlockedVol += vol;
                    unlockedWeight += w;
                }
            });

            const contVol = container.length * container.width * container.height;
            const practicalVol = Math.max(0, contVol * 0.82 - lockedVol); // 扣除精准锁定物品后的剩余三维有效容量
            const maxW = Math.max(0, (container.maxWeight || Infinity) - lockedWeight); // 扣除精准锁定物品后的剩余承重

            if (unlockedVol > practicalVol || unlockedWeight > maxW) {
                const volRatio = unlockedVol > 0 ? practicalVol / unlockedVol : 1.0;
                const weightRatio = unlockedWeight > 0 ? maxW / unlockedWeight : 1.0;
                const reduceRatio = Math.min(1.0, volRatio, weightRatio);

                if (reduceRatio < 1.0) {
                    let totalVolScore = 0;
                    let totalWeightScore = 0;
                    const excessVol = Math.max(0, unlockedVol - practicalVol);
                    const excessWeight = Math.max(0, unlockedWeight - maxW);

                    if (options.volumeReduction) {
                        preprocessedList.forEach(it => {
                            if (!it.locked) {
                                const gVol = (it.length * it.width * it.height) * (it.quantity || 1);
                                totalVolScore += gVol * gVol;
                                const gW = (it.weight || 0) * (it.quantity || 1);
                                totalWeightScore += gW * gW;
                            }
                        });
                    }

                    effectiveItemsList = [];
                    preprocessedList.forEach(item => {
                        const origQ = item.quantity || 1;
                        if (item.locked) {
                            // 精准锁定物品：剔除削减权重，保持原定数量不削减
                            effectiveItemsList.push({ ...item });
                        } else {
                            let targetQ;
                            if (options.volumeReduction) {
                                // 体积递减：按照每个规格的货物整体体积比重（整体体积更大则承担更大削减份额），等比例递减体积
                                const unitVol = item.length * item.width * item.height;
                                const groupVol = unitVol * origQ;
                                const unitW = item.weight || 0;
                                const groupW = unitW * origQ;
                                const cutVol = totalVolScore > 0 ? excessVol * ((groupVol * groupVol) / totalVolScore) : 0;
                                const cutW = totalWeightScore > 0 ? excessWeight * ((groupW * groupW) / totalWeightScore) : 0;
                                const cutQVol = unitVol > 0 ? Math.round(cutVol / unitVol) : 0;
                                const cutQW = unitW > 0 ? Math.round(cutW / unitW) : 0;
                                const cutQ = Math.min(origQ - 1, Math.max(0, Math.max(cutQVol, cutQW)));
                                targetQ = Math.max(1, origQ - cutQ);
                            } else {
                                // 数量递减：超载时等比例均匀削减每个种类的数量
                                targetQ = Math.max(1, Math.round(origQ * reduceRatio));
                            }
                            const cutQ = origQ - targetQ;
                            
                            if (cutQ > 0) {
                                const reasonText = options.volumeReduction
                                    ? '开启体积递减装箱：权衡数量与体积总和超载按整体体积比重削减'
                                    : '开启数量递减装箱：权衡数量与体积总和超载按数量比例削减';
                                for (let c = 0; c < cutQ; c++) {
                                    this.unpackedItems.push({
                                        ...item,
                                        uid: `${item.id || item.name}_cut_${c + 1}`,
                                        volume: item.length * item.width * item.height,
                                        reason: reasonText
                                    });
                                }
                            }
                            effectiveItemsList.push({
                                ...item,
                                quantity: targetQ
                            });
                        }
                    });
                }
            }
        }

        // 1. 将数量大于1的物品展开为单件个体
        let expandedItems = [];
        effectiveItemsList.forEach(item => {
            for (let i = 0; i < item.quantity; i++) {
                expandedItems.push({
                    ...item,
                    uid: `${item.id || item.name}_${i + 1}`,
                    volume: item.length * item.width * item.height
                });
            }
        });

        // 2. 启发式绝对分组排序：先把所有物品按规格签名(W×H×L)绝对归类分组！
        // 彻底根除同体积或相近尺寸货物交叉打散的散乱现象，确保同规格100%互相贴合连在一起成块装卸！
        const specGroups = {};
        expandedItems.forEach(item => {
            const sig = `${item.width}x${item.height}x${item.length}`;
            item.specSig = sig;
            if (!specGroups[sig]) {
                specGroups[sig] = {
                    sig,
                    volume: item.volume,
                    weight: item.weight,
                    items: []
                };
            }
            specGroups[sig].items.push(item);
        });

        const sortedGroups = Object.values(specGroups).sort((g1, g2) => {
            // 0. 精准锁定的货物组具有绝对最高优先级，排在最前面优先装车，确保其必须严格装入
            const lock1 = g1.items[0].locked ? 1 : 0;
            const lock2 = g2.items[0].locked ? 1 : 0;
            if (lock2 !== lock1) return lock2 - lock1;

            const l1 = g1.items[0].length;
            const l2 = g2.items[0].length;
            if (l2 !== l1) return l2 - l1; // 1. 优先按长边降序（构建整齐平整的纵向截面排墙）

            const w1 = g1.items[0].width;
            const w2 = g2.items[0].width;
            if (w2 !== w1) return w2 - w1; // 2. 其次按宽度降序（宽垫底、窄压顶，确保重心平稳不摇晃）

            const area1 = g1.items[0].width * g1.items[0].height;
            const area2 = g2.items[0].width * g2.items[0].height;
            if (area2 !== area1) return area2 - area1; // 3. 截面面积降序

            if (g2.volume !== g1.volume) return g2.volume - g1.volume;
            return g1.sig.localeCompare(g2.sig);
        });

        expandedItems = [];
        sortedGroups.forEach(g => {
            expandedItems.push(...g.items);
        });

        let currentTotalWeight = 0;

        // 3. 逐个尝试装入物品（贪心纵向直立筑柱法，优先垂直直叠相同的物品）
        const attemptPackingLoop = (unplacedPool) => {
            let unplaced = [...unplacedPool];
            while (unplaced.length > 0) {
                let item = unplaced[0];

                // 承重限制检查
                if (currentTotalWeight + item.weight > this.container.maxWeight) {
                    this.unpackedItems.push({ ...item, reason: item.reason || '超出容器最大承重限制' });
                    unplaced.shift();
                    continue;
                }

                // 计算当前剩余货物的最小尺寸限制，为无效缝隙的判断提供依据
                let minRemainingWidth = Infinity;
                let minRemainingLength = Infinity;
                unplaced.forEach(unp => {
                    minRemainingWidth = Math.min(minRemainingWidth, unp.width);
                    minRemainingLength = Math.min(minRemainingLength, unp.length);
                });
                if (minRemainingWidth === Infinity) minRemainingWidth = 100;
                if (minRemainingLength === Infinity) minRemainingLength = 100;

                // 对当前所有极端点按 X(由深至浅，背板至车门) -> Y(自下而上) -> Z(由左至右) 排序
                this.extremePoints.sort((p1, p2) => {
                    if (p1.x !== p2.x) return p1.x - p2.x;
                    if (p1.y !== p2.y) return p1.y - p2.y;
                    return p1.z - p2.z;
                });

                let bestPlacement = null;
                let bestScore = Infinity;

                const validRotations = this.getItemRotations(item);

                for (let point of this.extremePoints) {
                    for (let rot of validRotations) {
                        let finalPoint = null;
                        
                        // 1. 基础摆放校验
                        if (this.canPlace(point, rot, item)) {
                            finalPoint = { ...point };

                            // 2. 主动向右挤压对齐 (Z-axis Squeezing)
                            // 探测放置后其右侧与右侧障碍物（或集装箱右壁）之间的缝隙
                            let nearestObstacleZ = this.container.width;
                            const minX1 = point.x, maxX1 = point.x + rot.l;
                            const minY1 = point.y, maxY1 = point.y + rot.h;

                            for (let box of this.packedItems) {
                                if (box.z >= point.z + rot.w) {
                                    const overlapX = minX1 < box.x + box.packedLength && maxX1 > box.x;
                                    const overlapY = minY1 < box.y + box.packedHeight && maxY1 > box.y;
                                    if (overlapX && overlapY) {
                                        nearestObstacleZ = Math.min(nearestObstacleZ, box.z);
                                    }
                                }
                            }

                            const gapZ = nearestObstacleZ - (point.z + rot.w);
                            // 若产生极窄无效缝隙，则尝试向右侧滑动贴紧障碍物/右壁
                            if (gapZ > 0 && gapZ < minRemainingWidth) {
                                const shiftedZ = nearestObstacleZ - rot.w;
                                if (shiftedZ > point.z && this.canPlace({ x: point.x, y: point.y, z: shiftedZ }, rot, item)) {
                                    finalPoint.z = shiftedZ;
                                }
                            }
                        }

                        // 3. 启发式评分计算 (寻找 Score 最小的放置方案)
                        if (finalPoint) {
                            // 3.1 基础坐标分 (深 X > 底 Y > 靠边 Z)
                            let score = finalPoint.x * 1000000 + finalPoint.y * 1000 + finalPoint.z;

                            // 3.2 空间紧凑度分 (Bounding Box 包络体积增加量，防止打散，大幅度提高紧凑权重)
                            let maxEndX = finalPoint.x + rot.l;
                            let maxEndY = finalPoint.y + rot.h;
                            let maxEndZ = finalPoint.z + rot.w;
                            for (let box of this.packedItems) {
                                maxEndX = Math.max(maxEndX, box.x + box.packedLength);
                                maxEndY = Math.max(maxEndY, box.y + box.packedHeight);
                                maxEndZ = Math.max(maxEndZ, box.z + box.packedWidth);
                            }
                            const boundingBoxVolume = maxEndX * maxEndY * maxEndZ;
                            const compactnessScore = (boundingBoxVolume / 1e6) * 8.0; 

                            // 3.3 贴边度接触面积分 (与壁面、其它货物接触面积越大越好，作为减分项)
                            let contactArea = 0;
                            // 与容器壁接触
                            if (finalPoint.x === 0) contactArea += rot.w * rot.h; // 后壁
                            if (finalPoint.y === 0) contactArea += rot.l * rot.w; // 地板
                            if (finalPoint.z === 0) contactArea += rot.l * rot.h; // 左侧壁
                            if (finalPoint.z + rot.w === this.container.width) contactArea += rot.l * rot.h; // 右侧壁

                            // 与已装货物接触
                            const fMinX = finalPoint.x, fMaxX = finalPoint.x + rot.l;
                            const fMinY = finalPoint.y, fMaxY = finalPoint.y + rot.h;
                            const fMinZ = finalPoint.z, fMaxZ = finalPoint.z + rot.w;

                            for (let box of this.packedItems) {
                                const bMinX = box.x, bMaxX = box.x + box.packedLength;
                                const bMinY = box.y, bMaxY = box.y + box.packedHeight;
                                const bMinZ = box.z, bMaxZ = box.z + box.packedWidth;

                                // X 面接触面积
                                if (bMaxX === fMinX || fMaxX === bMinX) {
                                    const ovY = Math.min(fMaxY, bMaxY) - Math.max(fMinY, bMinY);
                                    const ovZ = Math.min(fMaxZ, bMaxZ) - Math.max(fMinZ, bMinZ);
                                    if (ovY > 0 && ovZ > 0) contactArea += ovY * ovZ;
                                }
                                // Y 面接触面积
                                if (bMaxY === fMinY || fMaxY === bMinY) {
                                    const ovX = Math.min(fMaxX, bMaxX) - Math.max(fMinX, bMinX);
                                    const ovZ = Math.min(fMaxZ, bMaxZ) - Math.max(fMinZ, bMinZ);
                                    if (ovX > 0 && ovZ > 0) contactArea += ovX * ovZ;
                                }
                                // Z 面接触面积
                                if (bMaxZ === fMinZ || fMaxZ === bMinZ) {
                                    const ovX = Math.min(fMaxX, bMaxX) - Math.max(fMinX, bMinX);
                                    const ovY = Math.min(fMaxY, bMaxY) - Math.max(fMinY, bMinY);
                                    if (ovX > 0 && ovY > 0) contactArea += ovX * ovY;
                                }
                            }
                            const contactScore = (contactArea / 1e3) * 20.0; // 大幅提高贴边度权重 (至 20)

                            // 3.4 边界无效空隙惩罚项
                            let gapZPenalty = 0;
                            const finalGapZ = this.container.width - (finalPoint.z + rot.w);
                            if (finalGapZ > 0 && finalGapZ < minRemainingWidth) {
                                gapZPenalty = 80000000; // 极高惩罚值，确保避免右侧无法利用空隙
                            }

                            let gapXPenalty = 0;
                            const finalGapX = this.container.length - (finalPoint.x + rot.l);
                            if (finalGapX > 0 && finalGapX < minRemainingLength) {
                                gapXPenalty = 20000000;
                            }

                            // 3.5 综合评分合成
                            const totalScore = score + compactnessScore - contactScore + gapZPenalty + gapXPenalty;

                            if (totalScore < bestScore) {
                                bestScore = totalScore;
                                bestPlacement = {
                                    point: { ...finalPoint },
                                    dimension: rot,
                                    rotationType: rot.typeName
                                };
                            }
                        }
                    }
                }

                if (bestPlacement) {
                    unplaced.shift(); // 移除基准物品
                    const { point, dimension, rotationType } = bestPlacement;

                    let stackedItems = [item];
                    let currentStackHeight = dimension.h;
                    let currentStackWeight = item.weight;

                    let stackSpecs = new Set([item.specSig || `${item.width}x${item.height}x${item.length}`]);
                    let idx = 0;
                    while (idx < unplaced.length) {
                        let cand = unplaced[idx];
                        let candRot = this.getItemRotations(cand)[0];
                        let topBox = stackedItems[stackedItems.length - 1];
                        let topBoxWidth = topBox.packedWidth || topBox.width;
                        let topBoxLength = topBox.packedLength || topBox.length;

                        const candSpec = cand.specSig || `${cand.width}x${cand.height}x${cand.length}`;
                        const willSpecsCount = stackSpecs.has(candSpec) ? stackSpecs.size : stackSpecs.size + 1;

                        const canStackSameOrMixed = (candRot.l <= topBoxLength) &&
                                                    (candRot.w <= topBoxWidth) &&
                                                    (willSpecsCount <= 2);

                        if (canStackSameOrMixed) {
                            let testPoint = { x: point.x, y: point.y + currentStackHeight, z: point.z };
                            if (testPoint.y + candRot.h <= this.container.height &&
                                currentTotalWeight + currentStackWeight + cand.weight <= this.container.maxWeight &&
                                this.canPlace(testPoint, candRot, cand)) {
                                
                                stackedItems.push({ ...cand, packedRot: candRot });
                                stackSpecs.add(candSpec);
                                currentStackHeight += candRot.h;
                                currentStackWeight += cand.weight;
                                unplaced.splice(idx, 1);
                                continue;
                            }
                        }
                        idx++;
                    }

                    let curY = point.y;
                    stackedItems.forEach((sItem, sIdx) => {
                        const rotDim = sItem.packedRot || dimension;
                        const packedBox = {
                            ...sItem,
                            x: point.x,
                            y: curY,
                            z: point.z,
                            packedLength: rotDim.l,
                            packedWidth: rotDim.w,
                            packedHeight: rotDim.h,
                            rotationType: rotDim.typeName || rotationType,
                            stepIndex: this.packedItems.length + 1,
                            isColumnBase: sIdx === 0
                        };
                        curY += rotDim.h;
                        this.packedItems.push(packedBox);
                    });

                    currentTotalWeight += currentStackWeight;

                    const towerBoundingBox = {
                        x: point.x,
                        y: point.y,
                        z: point.z,
                        packedLength: dimension.l,
                        packedWidth: dimension.w,
                        packedHeight: currentStackHeight
                    };
                    this.updateExtremePoints(towerBoundingBox);

                } else {
                    unplaced.shift();
                    this.unpackedItems.push({ ...item, reason: item.reason || '容器空间不足或尺寸干涉' });
                }
            }
        };

        // 阶段一：基本装箱（若开启均匀递减，则是等比均摊后的基础配额装箱）
        attemptPackingLoop(expandedItems);

        // 阶段二：余量空间二次回填补漏（只对因摆放顺序/旋转问题未能装入的基础配额货物尝试回填，严禁将已决定削减的_cut_超载项强行塞回）
        if (options && (options.uniformReduction || options.volumeReduction) && this.unpackedItems.length > 0) {
            const failedPool = this.unpackedItems.filter(it => !it.uid || !it.uid.includes('_cut_')).sort((a, b) => b.volume - a.volume);
            const cutPool = this.unpackedItems.filter(it => it.uid && it.uid.includes('_cut_'));
            this.unpackedItems = [...cutPool];
            attemptPackingLoop(failedPool);
        }

        // [新增] 阶段三：柜门末端余量空间横向填充（允许物体长度沿箱子宽度方向放置，最大化利用空间）
        if (options && options.transversePacking && this.unpackedItems.length > 0) {
            const originalGetRotations = this.getItemRotations;
            this.getItemRotations = (item) => {
                if (item.rotatable === false) return [];
                // 仅返回横向放置，尝试将剩余物品横向塞入柜门处
                return [{ l: item.width, w: item.length, h: item.height, typeName: '横向放置 (长L沿箱宽Z)' }];
            };
            const isReductionActive = options.uniformReduction || options.volumeReduction;
            const doorPool = (isReductionActive ? this.unpackedItems.filter(it => !it.uid || !it.uid.includes('_cut_')) : [...this.unpackedItems]).sort((a, b) => b.volume - a.volume);
            const preservedCuts = isReductionActive ? this.unpackedItems.filter(it => it.uid && it.uid.includes('_cut_')) : [];
            this.unpackedItems = [...preservedCuts];
            attemptPackingLoop(doorPool);
            this.getItemRotations = originalGetRotations;
        }

        // [新增] 阶段四：柜门末端及上方剩余高空区域竖向填充（最后再算一次空间剩余，把货物最长方向长度L竖起来沿着高度Y方向摆放）
        if (options && options.verticalPacking && this.unpackedItems.length > 0) {
            const originalGetRotations = this.getItemRotations;
            this.getItemRotations = (item) => {
                if (item.rotatable === false) return [];
                // 允许长度 L 沿高度 Y 方向直立摆放，支持正向与横向两种底部横截面朝向，最大化利用高空及柜门缝隙
                return [
                    { l: item.height, w: item.width, h: item.length, typeName: '竖向正放 (长L沿箱高Y)' },
                    { l: item.width, w: item.height, h: item.length, typeName: '竖向侧放 (长L沿箱高Y)' }
                ];
            };
            const isReductionActive = options.uniformReduction || options.volumeReduction;
            const verticalPool = (isReductionActive ? this.unpackedItems.filter(it => !it.uid || !it.uid.includes('_cut_')) : [...this.unpackedItems]).sort((a, b) => b.volume - a.volume);
            const preservedCuts = isReductionActive ? this.unpackedItems.filter(it => it.uid && it.uid.includes('_cut_')) : [];
            this.unpackedItems = [...preservedCuts];
            attemptPackingLoop(verticalPool);
            this.getItemRotations = originalGetRotations;
        }

        // 阶段四：货物堆叠落差平顺化（相邻柱高平衡）
        // 解决例如“10件货物堆叠成7和3”导致落差较大易晃动倾倒的问题，将7和3自动平衡为5和5。
        this.balanceColumnHeights();

        // 将手动锁定的剔除件数追加到最终的未放入清单中，保障回填逻辑不受干扰，且清单汇总数字完全精确
        this.unpackedItems.push(...lockCutList);

        // 计算终局指标
        const totalContainerVolume = this.container.length * this.container.width * this.container.height;
        const packedVolume = this.packedItems.reduce((sum, item) => sum + (item.packedLength * item.packedWidth * item.packedHeight), 0);
        const utilization = totalContainerVolume > 0 ? ((packedVolume / totalContainerVolume) * 100).toFixed(2) : '0.00';

        return {
            packedItems: this.packedItems,
            unpackedItems: this.unpackedItems,
            stats: {
                totalContainerVolume: (totalContainerVolume / 1e9).toFixed(3), // m³ (assuming mm)
                packedVolume: (packedVolume / 1e9).toFixed(3),
                totalWeight: currentTotalWeight,
                maxWeight: this.container.maxWeight,
                utilizationPercentage: parseFloat(utilization),
                packedCount: this.packedItems.length,
                unpackedCount: this.unpackedItems.length,
                totalCount: this.packedItems.length + this.unpackedItems.length
            }
        };
    }

    compute2CylinderSaddle(A, B, r_C, containerWidth, containerHeight) {
        const r_A = (A.packedWidth || A.diameter) / 2;
        const r_B = (B.packedWidth || B.diameter) / 2;
        const C_A = { y: A.y + (A.packedHeight || A.diameter) / 2, z: A.z + (A.packedWidth || A.diameter) / 2 };
        const C_B = { y: B.y + (B.packedHeight || B.diameter) / 2, z: B.z + (B.packedWidth || B.diameter) / 2 };
        const d_sq = Math.pow(C_A.z - C_B.z, 2) + Math.pow(C_A.y - C_B.y, 2);
        const d = Math.sqrt(d_sq);
        const R1 = r_A + r_C;
        const R2 = r_B + r_C;
        if (d < 1e-4 || d > R1 + R2 - 1e-4 || d < Math.abs(R1 - R2)) return null;

        const a = (R1 * R1 - R2 * R2 + d * d) / (2 * d);
        const h_sq = Math.max(0, R1 * R1 - a * a);
        const h = Math.sqrt(h_sq);
        const dz = (C_B.z - C_A.z) / d;
        const dy = (C_B.y - C_A.y) / d;

        const z1 = C_A.z + a * dz - h * dy;
        const y1 = C_A.y + a * dy + h * dz;
        const z2 = C_A.z + a * dz + h * dy;
        const y2 = C_A.y + a * dy - h * dz;

        let best_y_center = y1, best_z_center = z1;
        if (y2 > y1) {
            best_y_center = y2;
            best_z_center = z2;
        }
        const y = best_y_center - r_C;
        const z = best_z_center - r_C;
        if (y < -1e-4 || z < -1e-4 || z + r_C * 2 > containerWidth + 1e-4 || y + r_C * 2 > containerHeight + 1e-4) {
            return null;
        }
        return { y: Math.max(0, y), z: Math.max(0, z) };
    }

    simulateCylinderGravityRolling(y0, z0, D, segmentPacked, containerWidth, containerHeight) {
        const r = D / 2;
        let y = y0, z = z0;
        let hadRolling = false;
        const maxSteps = 80;

        for (let step = 0; step < maxSteps; step++) {
            let max_drop_y = 0;
            const C_z = z + r;
            for (let E of segmentPacked) {
                const r_E = (E.packedWidth || E.diameter) / 2;
                const E_z = E.z + r_E, E_y = E.y + (E.packedHeight || E.diameter) / 2;
                if (Math.abs(C_z - E_z) < r + r_E - 1e-4) {
                    const dy_sq = Math.pow(r + r_E, 2) - Math.pow(C_z - E_z, 2);
                    if (dy_sq >= 0) {
                        const y_hit = E_y + Math.sqrt(dy_sq) - r;
                        if (y_hit <= y + 1e-3 && y_hit > max_drop_y) {
                            max_drop_y = y_hit;
                        }
                    }
                }
            }
            if (y - max_drop_y > 1e-2) {
                y = max_drop_y;
                hadRolling = true;
            }
            if (y <= 1e-3) {
                y = 0;
                break;
            }

            const C_y = y + r;
            const contacts = [];
            if (z <= 1e-3) contacts.push({ type: 'wall' });
            if (z + D >= containerWidth - 1e-3) contacts.push({ type: 'wall' });

            for (let E of segmentPacked) {
                const r_E = (E.packedWidth || E.diameter) / 2;
                const E_z = E.z + r_E, E_y = E.y + (E.packedHeight || E.diameter) / 2;
                const distSq = Math.pow(C_z - E_z, 2) + Math.pow(C_y - E_y, 2);
                if (distSq <= Math.pow(r + r_E + 1e-2, 2) && E_y <= C_y + 1e-4) {
                    contacts.push({ type: 'cylinder', item: E, ez: E_z, ey: E_y, er: r_E });
                }
            }

            if (contacts.length >= 2 || contacts.length === 0) {
                break;
            }

            const contact = contacts[0];
            if (contact.type === 'wall') {
                continue;
            }

            let rollDir = 0;
            if (C_z > contact.ez + 1e-3) rollDir = 1;
            else if (C_z < contact.ez - 1e-3) rollDir = -1;
            else rollDir = (step % 2 === 0 ? 1 : -1);

            let angle = Math.atan2(C_y - contact.ey, C_z - contact.ez);
            angle += 0.08 * (rollDir === 1 ? -1 : 1);

            const new_Cz = contact.ez + (r + contact.er) * Math.cos(angle);
            const new_Cy = contact.ey + (r + contact.er) * Math.sin(angle);
            const new_z = new_Cz - r;
            const new_y = new_Cy - r;

            if (new_y <= 0) {
                y = 0;
                z = Math.max(0, Math.min(containerWidth - D, new_z));
                hadRolling = true;
                break;
            }
            if (new_z <= 0) {
                z = 0;
                y = Math.max(0, new_y);
                hadRolling = true;
                break;
            }
            if (new_z + D >= containerWidth) {
                z = containerWidth - D;
                y = Math.max(0, new_y);
                hadRolling = true;
                break;
            }

            let collisionB = null;
            for (let B of segmentPacked) {
                if (B === contact.item) continue;
                const r_B = (B.packedWidth || B.diameter) / 2;
                const B_z = B.z + r_B, B_y = B.y + (B.packedHeight || B.diameter) / 2;
                if (Math.pow(new_Cz - B_z, 2) + Math.pow(new_Cy - B_y, 2) < Math.pow(r + r_B - 1e-3, 2)) {
                    collisionB = B;
                    break;
                }
            }
            if (collisionB) {
                const exactSaddle = this.compute2CylinderSaddle(contact.item, collisionB, r, containerWidth, containerHeight);
                if (exactSaddle) {
                    y = exactSaddle.y;
                    z = exactSaddle.z;
                } else {
                    y = new_y;
                    z = new_z;
                }
                hadRolling = true;
                break;
            }
            y = new_y;
            z = new_z;
            hadRolling = true;
        }

        return { y: Math.max(0, Math.round(y * 100) / 100), z: Math.max(0, Math.round(z * 100) / 100), hadRolling };
    }

    findNextStableCylinderPosition(cand, segmentPacked, container) {
        const D = cand.diameter || cand.packedWidth;
        const r_C = D / 2;
        const candidates = [];

        candidates.push({ y: 0, z: 0 });
        for (let E of segmentPacked) {
            const E_w = E.packedWidth || E.diameter;
            if (E.z + E_w + D <= container.width + 1e-4) {
                candidates.push({ y: 0, z: E.z + E_w });
            }
            if (E.z - D >= -1e-4) {
                candidates.push({ y: 0, z: E.z - D });
            }
        }

        const rowStep = D * (Math.sqrt(3) / 2);
        for (let k = 0; k * rowStep + D <= container.height + 1e-4; k++) {
            const zShift = (k % 2 === 0) ? 0 : (D / 2);
            for (let j = 0; zShift + j * D + D <= container.width + 1e-4; j++) {
                candidates.push({ y: k * rowStep, z: zShift + j * D });
            }
        }

        for (let i = 0; i < segmentPacked.length; i++) {
            for (let j = i + 1; j < segmentPacked.length; j++) {
                const saddle = this.compute2CylinderSaddle(segmentPacked[i], segmentPacked[j], r_C, container.width, container.height);
                if (saddle) candidates.push(saddle);
            }
        }

        for (let E of segmentPacked) {
            const r_E = (E.packedWidth || E.diameter) / 2;
            const E_z = E.z + r_E, E_y = E.y + (E.packedHeight || E.diameter) / 2;
            let dy_sq = Math.pow(r_C + r_E, 2) - Math.pow(r_C - E_z, 2);
            if (dy_sq >= 0) {
                const y_c = E_y + Math.sqrt(dy_sq);
                if (y_c - r_C >= 0 && y_c + r_C <= container.height) {
                    candidates.push({ y: y_c - r_C, z: 0 });
                }
            }
            dy_sq = Math.pow(r_C + r_E, 2) - Math.pow(container.width - r_C - E_z, 2);
            if (dy_sq >= 0) {
                const y_c = E_y + Math.sqrt(dy_sq);
                if (y_c - r_C >= 0 && y_c + r_C <= container.height) {
                    candidates.push({ y: y_c - r_C, z: container.width - D });
                }
            }
        }

        let bestPos = null;
        for (let candPos of candidates) {
            const simulated = this.simulateCylinderGravityRolling(candPos.y, candPos.z, D, segmentPacked, container.width, container.height);
            const sy = simulated.y;
            const sz = simulated.z;

            if (sy < -1e-4 || sz < -1e-4 || sy + D > container.height + 1e-4 || sz + D > container.width + 1e-4) {
                continue;
            }
            let hasCollision = false;
            const center_sy = sy + r_C, center_sz = sz + r_C;
            for (let E of segmentPacked) {
                const r_E = (E.packedWidth || E.diameter) / 2;
                const center_Ey = E.y + (E.packedHeight || E.diameter) / 2, center_Ez = E.z + r_E;
                const distSq = Math.pow(center_sy - center_Ey, 2) + Math.pow(center_sz - center_Ez, 2);
                if (distSq < Math.pow(r_C + r_E - 1e-2, 2)) {
                    hasCollision = true;
                    break;
                }
            }
            if (hasCollision) continue;

            if (!bestPos || sy < bestPos.y - 1e-2 || (Math.abs(sy - bestPos.y) <= 1e-2 && sz < bestPos.z - 1e-2)) {
                bestPos = { y: sy, z: sz, hadRolling: simulated.hadRolling };
            }
        }
        return bestPos;
    }

    /**
     * 圆柱体专属装箱引擎（图2交互蜂窝交错嵌套 + 门口及高空余量防滚落只能竖放）
     */
    packAsCylinders(container, preprocessedList, lockCutList, options) {
        this.container = container;
        this.packedItems = [];
        this.unpackedItems = [];

        // 数量/体积递减处理
        let effectiveItemsList = preprocessedList;
        if (options && (options.uniformReduction || options.volumeReduction)) {
            let lockedVol = 0;
            let lockedWeight = 0;
            let unlockVol = 0;
            let unlockWeight = 0;
            preprocessedList.forEach(item => {
                const D = item.diameter || item.width || 500;
                const L = item.length || 1000;
                const vol = Math.PI * Math.pow(D / 2, 2) * L;
                if (item.locked && item.targetPacked !== undefined) {
                    lockedVol += vol * item.quantity;
                    lockedWeight += item.weight * item.quantity;
                } else {
                    unlockVol += vol * item.quantity;
                    unlockWeight += item.weight * item.quantity;
                }
            });

            const totalContainerVol = container.length * container.width * container.height;
            const maxAllowedVol = totalContainerVol * 0.85; // 圆柱交互蜂窝嵌套理论最高体积占用约85%
            const maxAllowedWeight = container.maxWeight;

            let reduceRatio = 1.0;
            if (lockedVol + unlockVol > maxAllowedVol || lockedWeight + unlockWeight > maxAllowedWeight) {
                const volRatio = unlockVol > 0 ? (maxAllowedVol - lockedVol) / unlockVol : 1;
                const weightRatio = unlockWeight > 0 ? (maxAllowedWeight - lockedWeight) / unlockWeight : 1;
                reduceRatio = Math.min(1.0, Math.max(0.01, Math.min(volRatio, weightRatio)));
            }

            if (reduceRatio < 1.0) {
                let totalVolScore = 0;
                let totalWeightScore = 0;
                const excessVol = Math.max(0, unlockVol - (maxAllowedVol - lockedVol));
                const excessWeight = Math.max(0, unlockWeight - (maxAllowedWeight - lockedWeight));

                if (options.volumeReduction) {
                    preprocessedList.forEach(it => {
                        if (!it.locked || it.targetPacked === undefined) {
                            const D = it.diameter || it.width || 500;
                            const L = it.length || 1000;
                            const gVol = Math.PI * Math.pow(D / 2, 2) * L * (it.quantity || 1);
                            totalVolScore += gVol * gVol;
                            const gW = (it.weight || 0) * (it.quantity || 1);
                            totalWeightScore += gW * gW;
                        }
                    });
                }

                effectiveItemsList = [];
                preprocessedList.forEach(item => {
                    const origQ = item.quantity || 1;
                    const D = item.diameter || item.width || 500;
                    const L = item.length || 1000;
                    if (item.locked && item.targetPacked !== undefined) {
                        effectiveItemsList.push({ ...item });
                    } else {
                        let targetQ;
                        if (options.volumeReduction) {
                            const unitVol = Math.PI * Math.pow(D / 2, 2) * L;
                            const groupVol = unitVol * origQ;
                            const unitW = item.weight || 0;
                            const groupW = unitW * origQ;
                            const cutVol = totalVolScore > 0 ? excessVol * ((groupVol * groupVol) / totalVolScore) : 0;
                            const cutW = totalWeightScore > 0 ? excessWeight * ((groupW * groupW) / totalWeightScore) : 0;
                            const cutQVol = unitVol > 0 ? Math.round(cutVol / unitVol) : 0;
                            const cutQW = unitW > 0 ? Math.round(cutW / unitW) : 0;
                            const cutQ = Math.min(origQ - 1, Math.max(0, Math.max(cutQVol, cutQW)));
                            targetQ = Math.max(1, origQ - cutQ);
                        } else {
                            targetQ = Math.max(1, Math.round(origQ * reduceRatio));
                        }
                        const cutQ = origQ - targetQ;
                        if (cutQ > 0) {
                            const reasonText = options.volumeReduction
                                ? '开启体积递减装箱：权衡数量与体积总和超载按整体体积比重削减'
                                : '开启数量递减装箱：权衡数量与体积总和超载按数量比例削减';
                            for (let c = 0; c < cutQ; c++) {
                                this.unpackedItems.push({
                                    ...item,
                                    uid: `${item.id || item.name}_cut_${c + 1}`,
                                    volume: Math.PI * Math.pow(D / 2, 2) * L,
                                    reason: reasonText
                                });
                            }
                        }
                        effectiveItemsList.push({ ...item, quantity: targetQ });
                    }
                });
            }
        }

        // 展开单件
        let expandedItems = [];
        effectiveItemsList.forEach(item => {
            const D = item.diameter || item.width || 500;
            const L = item.length || 1000;
            for (let i = 0; i < item.quantity; i++) {
                expandedItems.push({
                    ...item,
                    diameter: D,
                    width: D,
                    height: D,
                    length: L,
                    uid: `${item.id || item.name}_${i + 1}`,
                    volume: Math.PI * Math.pow(D / 2, 2) * L
                });
            }
        });

        // 按规格分组
        const specGroups = {};
        expandedItems.forEach(item => {
            const sig = `Φ${item.diameter}x${item.length}`;
            item.specSig = sig;
            if (!specGroups[sig]) {
                specGroups[sig] = {
                    sig, diameter: item.diameter, length: item.length, volume: item.volume, weight: item.weight, items: []
                };
            }
            specGroups[sig].items.push(item);
        });

        const sortedGroups = Object.values(specGroups).sort((g1, g2) => {
            const lock1 = g1.items[0].locked ? 1 : 0;
            const lock2 = g2.items[0].locked ? 1 : 0;
            if (lock2 !== lock1) return lock2 - lock1;
            if (g2.diameter !== g1.diameter) return g2.diameter - g1.diameter;
            if (g2.length !== g1.length) return g2.length - g1.length;
            return g2.volume - g1.volume;
        });

        let unplacedPool = [];
        sortedGroups.forEach(g => {
            unplacedPool.push(...g.items);
        });

        let currentTotalWeight = 0;
        let xOffset = 0;

        // 【核心阶段一：先物体长度放在柜子长度方向一致，按照图2交互嵌入蜂窝叠放】
        while (unplacedPool.length > 0) {
            let baseItem = unplacedPool[0];
            const D = baseItem.diameter;
            const L = baseItem.length;

            if (xOffset + L > this.container.length + 1e-5) {
                break;
            }

            const sameSpecIdxs = [];
            for (let i = 0; i < unplacedPool.length; i++) {
                if (unplacedPool[i].diameter === D && unplacedPool[i].length === L) {
                    sameSpecIdxs.push(i);
                }
            }
            if (sameSpecIdxs.length === 0) break;

            const placedIndicesInSegment = [];
            const segmentPacked = [];

            while (placedIndicesInSegment.length < sameSpecIdxs.length) {
                const targetPoolIdx = sameSpecIdxs[placedIndicesInSegment.length];
                const cand = unplacedPool[targetPoolIdx];

                if (currentTotalWeight + cand.weight > this.container.maxWeight) {
                    break;
                }

                const stablePos = this.findNextStableCylinderPosition(cand, segmentPacked, this.container);
                if (!stablePos) {
                    break;
                }

                let rotationText = '圆柱顺长摆放 (图2嵌套稳固巢点)';
                if (stablePos.hadRolling) {
                    rotationText = '圆柱顺长摆放 (重力滚动与坠落稳定于低谷处，自适应增容)';
                }

                const packedCyl = {
                    ...cand,
                    x: xOffset,
                    y: stablePos.y,
                    z: stablePos.z,
                    packedLength: L,
                    packedHeight: D,
                    packedWidth: D,
                    shape: 'cylinder',
                    isCylinder: true,
                    cylinderOrientation: 'X',
                    rotationType: rotationText,
                    hadRolling: stablePos.hadRolling || false,
                    stepIndex: this.packedItems.length + 1
                };
                this.packedItems.push(packedCyl);
                segmentPacked.push(packedCyl);
                currentTotalWeight += cand.weight;
                placedIndicesInSegment.push(targetPoolIdx);
            }

            placedIndicesInSegment.sort((a, b) => b - a).forEach(idx => {
                unplacedPool.splice(idx, 1);
            });

            if (placedIndicesInSegment.length > 0) {
                xOffset += L;
            } else {
                break;
            }
        }

        let remainingCylinders = [...unplacedPool];

        // 【核心阶段二：然后再计算剩余空间，严格剔除门口横放，仅允许防滚落竖立叠放】
        if (remainingCylinders.length > 0) {
            if (options && (options.transversePacking || options.verticalPacking)) {
                let vertPool = [...remainingCylinders];
                while (vertPool.length > 0) {
                    let cand = vertPool[0];
                    const D = cand.diameter;
                    const L = cand.length;
                    let placed = false;

                    // 1. 优先尝试在门口剩余段 [xOffset, container.length] 的水平底面区域中竖立放置
                    for (let testX = xOffset; testX + D <= this.container.length + 1e-5 && !placed; testX += D) {
                        for (let testZ = 0; testZ + D <= this.container.width + 1e-5 && !placed; testZ += D) {
                            let maxYBelow = 0;
                            for (let box of this.packedItems) {
                                const overlapX = testX < box.x + box.packedLength && testX + D > box.x;
                                const overlapZ = testZ < box.z + box.packedWidth && testZ + D > box.z;
                                if (overlapX && overlapZ) {
                                    maxYBelow = Math.max(maxYBelow, box.y + box.packedHeight);
                                }
                            }

                            if (maxYBelow + L <= this.container.height + 1e-5 && currentTotalWeight + cand.weight <= this.container.maxWeight) {
                                const packedCyl = {
                                    ...cand,
                                    x: testX,
                                    y: maxYBelow,
                                    z: testZ,
                                    packedLength: D,
                                    packedWidth: D,
                                    packedHeight: L,
                                    shape: 'cylinder',
                                    isCylinder: true,
                                    cylinderOrientation: 'Y',
                                    rotationType: '圆柱竖立摆放 (只能竖放防滚落)',
                                    stepIndex: this.packedItems.length + 1
                                };
                                this.packedItems.push(packedCyl);
                                currentTotalWeight += cand.weight;
                                placed = true;
                            }
                        }
                    }

                    // 2. 若门口已满，尝试在前方已成功放置的蜂窝圆柱上方高空余量平台竖放
                    if (!placed) {
                        for (let testX = 0; testX + D <= xOffset + 1e-5 && !placed; testX += D) {
                            for (let testZ = 0; testZ + D <= this.container.width + 1e-5 && !placed; testZ += D) {
                                let maxYBelow = 0;
                                let hasSupport = false;
                                for (let box of this.packedItems) {
                                    const overlapX = testX < box.x + box.packedLength && testX + D > box.x;
                                    const overlapZ = testZ < box.z + box.packedWidth && testZ + D > box.z;
                                    if (overlapX && overlapZ) {
                                        maxYBelow = Math.max(maxYBelow, box.y + box.packedHeight);
                                        hasSupport = true;
                                    }
                                }
                                if (hasSupport && maxYBelow + L <= this.container.height + 1e-5 && currentTotalWeight + cand.weight <= this.container.maxWeight) {
                                    const packedCyl = {
                                        ...cand,
                                        x: testX,
                                        y: maxYBelow,
                                        z: testZ,
                                        packedLength: D,
                                        packedWidth: D,
                                        packedHeight: L,
                                        shape: 'cylinder',
                                        isCylinder: true,
                                        cylinderOrientation: 'Y',
                                        rotationType: '圆柱竖立摆放 (只能竖放防滚落)',
                                        stepIndex: this.packedItems.length + 1
                                    };
                                    this.packedItems.push(packedCyl);
                                    currentTotalWeight += cand.weight;
                                    placed = true;
                                }
                            }
                        }
                    }

                    if (!placed) {
                        this.unpackedItems.push({
                            ...cand,
                            reason: '圆柱体剔除易滚落的横向摆放，且由于剩余高度或门口空间限制无法竖立摆放'
                        });
                    }
                    vertPool.shift();
                }
            } else {
                remainingCylinders.forEach(cand => {
                    this.unpackedItems.push({
                        ...cand,
                        reason: '未开启“柜门横竖填充”，圆柱体仅执行顺向交错嵌套，剩余空间未进行防滚落竖放填充'
                    });
                });
            }
        }

        this.unpackedItems.push(...lockCutList);

        const totalContainerVolume = this.container.length * this.container.width * this.container.height;
        let packedVolume = 0;
        this.packedItems.forEach(item => {
            const D = item.diameter || item.width || 500;
            const L = item.length || 1000;
            packedVolume += Math.PI * Math.pow(D / 2, 2) * (item.cylinderOrientation === 'Y' ? item.packedHeight : item.packedLength);
        });
        const utilization = totalContainerVolume > 0 ? ((packedVolume / totalContainerVolume) * 100).toFixed(2) : '0.00';

        return {
            packedItems: this.packedItems,
            unpackedItems: this.unpackedItems,
            stats: {
                totalContainerVolume: (totalContainerVolume / 1e9).toFixed(3),
                packedVolume: (packedVolume / 1e9).toFixed(3),
                totalWeight: currentTotalWeight,
                maxWeight: this.container.maxWeight,
                utilizationPercentage: parseFloat(utilization),
                packedCount: this.packedItems.length,
                unpackedCount: this.unpackedItems.length,
                totalCount: this.packedItems.length + this.unpackedItems.length
            }
        };
    }

    /**
     * 阶段三：货物堆叠落差平顺化（相邻柱高平衡）
     */
    balanceColumnHeights() {
        if (!this.packedItems || this.packedItems.length < 2) return;

        // 1. 将已装货物按照“规格签名_X_Z”进行垂直柱状分组
        const colMap = new Map();
        this.packedItems.forEach(box => {
            const sig = box.specSig || `${box.width}x${box.height}x${box.length}`;
            const key = `${sig}_${Math.round(box.x)}_${Math.round(box.z)}`;
            if (!colMap.has(key)) {
                colMap.set(key, {
                    key,
                    sig,
                    x: box.x,
                    z: box.z,
                    l: box.packedLength,
                    w: box.packedWidth,
                    h: box.packedHeight,
                    items: []
                });
            }
            colMap.get(key).items.push(box);
        });

        const cols = Array.from(colMap.values());
        cols.forEach(col => {
            col.items.sort((a, b) => a.y - b.y);
            col.baseY = col.items[0].y;
            col.count = col.items.length;
            col.topY = col.baseY + col.count * col.h;
        });

        // 2. 判断柱子顶部无遮挡干涉 (top-free)
        cols.forEach(col => {
            col.isTopFree = true;
            for (let box of this.packedItems) {
                if (col.items.includes(box)) continue;
                if (box.y >= col.topY - 5) {
                    const overlapX = (box.x < col.x + col.l - 5) && (box.x + box.packedLength > col.x + 5);
                    const overlapZ = (box.z < col.z + col.w - 5) && (box.z + box.packedWidth > col.z + 5);
                    if (overlapX && overlapZ) {
                        col.isTopFree = false;
                        break;
                    }
                }
            }
        });

        // 3. 将顶部无干涉的同规格柱子归类（打通柜门处与柜门往内多层，全局跨层智能平顺化落差，且严格保证不影响装箱总数）
        const groups = new Map();
        cols.filter(c => c.isTopFree && c.count >= 1).forEach(col => {
            const grpKey = col.sig; // 仅按物品规格打通分组，确保柜门内外层协同平衡
            if (!groups.has(grpKey)) groups.set(grpKey, []);
            groups.get(grpKey).push(col);
        });

        groups.forEach(groupCols => {
            if (groupCols.length < 2) return;

            let moved = true;
            let iterations = 0;
            while (moved && iterations < 500) {
                moved = false;
                iterations++;
                // 按照从集装箱地板最低处 (y=0) 算起的顶面绝对高度 topY 进行降序排序
                groupCols.sort((a, b) => b.topY - a.topY);
                const maxCol = groupCols[0];
                const minCol = groupCols[groupCols.length - 1];

                // 核心平衡条件：最高点与最低点相差超过 1.5 个单件高度，且待移出柱至少有2件货物
                if (maxCol.count >= 2 && (maxCol.topY - minCol.topY) >= (maxCol.h || 100) * 1.5) {
                    const boxToMove = maxCol.items[maxCol.items.length - 1];
                    const testPoint = { x: minCol.x, y: minCol.topY, z: minCol.z };
                    const testRot = { l: minCol.l, w: minCol.w, h: minCol.h };

                    if (testPoint.y + testRot.h <= this.container.height &&
                        this.canPlace(testPoint, testRot, boxToMove)) {
                        
                        maxCol.items.pop();
                        maxCol.count -= 1;
                        maxCol.topY -= maxCol.h;

                        boxToMove.x = minCol.x;
                        boxToMove.y = minCol.topY;
                        boxToMove.z = minCol.z;
                        boxToMove.packedLength = minCol.l;
                        boxToMove.packedWidth = minCol.w;
                        boxToMove.packedHeight = minCol.h;
                        if (minCol.items.length > 0) {
                            boxToMove.rotationType = minCol.items[0].rotationType;
                            boxToMove.packedRot = minCol.items[0].packedRot;
                        }
                        boxToMove.isColumnBase = false;
                        minCol.items.push(boxToMove);
                        minCol.count += 1;
                        minCol.topY += minCol.h;

                        moved = true;
                    } else {
                        for (let i = 0; i < groupCols.length - 1; i++) {
                            for (let j = groupCols.length - 1; j > i; j--) {
                                if (groupCols[i].count >= 2 && (groupCols[i].topY - groupCols[j].topY) >= (groupCols[i].h || 100) * 1.5) {
                                    const bMove = groupCols[i].items[groupCols[i].items.length - 1];
                                    const tPt = { x: groupCols[j].x, y: groupCols[j].topY, z: groupCols[j].z };
                                    const tRot = { l: groupCols[j].l, w: groupCols[j].w, h: groupCols[j].h };
                                    if (tPt.y + tRot.h <= this.container.height && this.canPlace(tPt, tRot, bMove)) {
                                        groupCols[i].items.pop();
                                        groupCols[i].count -= 1;
                                        groupCols[i].topY -= groupCols[i].h;

                                        bMove.x = groupCols[j].x;
                                        bMove.y = groupCols[j].topY;
                                        bMove.z = groupCols[j].z;
                                        bMove.packedLength = groupCols[j].l;
                                        bMove.packedWidth = groupCols[j].w;
                                        bMove.packedHeight = groupCols[j].h;
                                        if (groupCols[j].items.length > 0) {
                                            bMove.rotationType = groupCols[j].items[0].rotationType;
                                            bMove.packedRot = groupCols[j].items[0].packedRot;
                                        }
                                        bMove.isColumnBase = false;
                                        groupCols[j].items.push(bMove);
                                        groupCols[j].count += 1;
                                        groupCols[j].topY += groupCols[j].h;
                                        moved = true;
                                        break;
                                    }
                                }
                            }
                            if (moved) break;
                        }
                    }
                }
            }
        });

        // 4. 重新整理排序并赋予更新后的 stepIndex
        this.packedItems.sort((a, b) => {
            if (a.x !== b.x) return a.x - b.x;
            if (a.z !== b.z) return a.z - b.z;
            return a.y - b.y;
        });
        this.packedItems.forEach((box, idx) => {
            box.stepIndex = idx + 1;
        });
    }

    /**
     * 获取物品可用的摆放方向（限定顺向装箱：物品纵向长边必须严格对齐集装箱纵向长边）
     */
    getItemRotations(item) {
        return [{ l: item.length, w: item.width, h: item.height, typeName: '顺向对齐集装箱纵向 (宽W×高H×长L)' }];
    }

    /**
     * 检测待放置方块是否与容器边界及已装方块干涉碰撞
     */
    canPlace(point, dim, targetItem) {
        // 1. 容器边界检测
        if (point.x + dim.l > this.container.length ||
            point.y + dim.h > this.container.height ||
            point.z + dim.w > this.container.width) {
            return false;
        }

        const minX1 = point.x;
        const maxX1 = point.x + dim.l;
        const minY1 = point.y;
        const maxY1 = point.y + dim.h;
        const minZ1 = point.z;
        const maxZ1 = point.z + dim.w;

        // 2. AABB 碰撞检测与高方向堆叠规格数统计
        let specsInColumn = null;
        if (targetItem && point.y > 0) {
            const currentSpec = targetItem.specSig || `${targetItem.width}x${targetItem.height}x${targetItem.length}`;
            specsInColumn = new Set([currentSpec]);
        }

        for (let box of this.packedItems) {
            if (targetItem && (box === targetItem || (box.uid && targetItem.uid && box.uid === targetItem.uid))) continue;
            const minX2 = box.x;
            const maxX2 = box.x + box.packedLength;
            const minY2 = box.y;
            const maxY2 = box.y + box.packedHeight;
            const minZ2 = box.z;
            const maxZ2 = box.z + box.packedWidth;

            const overlapX = minX1 < maxX2 && maxX1 > minX2;
            const overlapZ = minZ1 < maxZ2 && maxZ1 > minZ2;

            // 判断三维空间是否重叠
            if (overlapX && overlapZ && (minY1 < maxY2 && maxY1 > minY2)) {
                return false; // 发生碰撞干涉
            }

            // 3. 高度方向堆叠规格种类限制与重心稳定性检测
            if (overlapX && overlapZ && box.y < point.y) {
                // 判断是否是直接下层承重货物（接触或极近距离）
                if (Math.abs((box.y + box.packedHeight) - point.y) <= 10) {
                    // 核心稳定性准则：宽度小的放在宽的上面，长度短的放在长的上面，绝不允许上大下小晃动悬空
                    if (dim.w > box.packedWidth || dim.l > box.packedLength) {
                        return false;
                    }
                }
                if (specsInColumn) {
                    const boxSpec = box.specSig || `${box.width}x${box.height}x${box.length}`;
                    specsInColumn.add(boxSpec);
                    if (specsInColumn.size > 2) {
                        return false; // 垂直方向最多只允许放两种规格物品
                    }
                }
            }
        }

        return true;
    }

    /**
     * 放置新方块后更新极端点池
     */
    updateExtremePoints(newBox) {
        // 1. 移除被该新方块占用的极端点
        this.extremePoints = this.extremePoints.filter(p => {
            const insideX = p.x >= newBox.x && p.x < newBox.x + newBox.packedLength;
            const insideY = p.y >= newBox.y && p.y < newBox.y + newBox.packedHeight;
            const insideZ = p.z >= newBox.z && p.z < newBox.z + newBox.packedWidth;
            return !(insideX && insideY && insideZ);
        });

        // 2. 产生该方块顶角衍生出的3个新候选极端点
        const candidatePoints = [
            { x: newBox.x + newBox.packedLength, y: newBox.y, z: newBox.z }, // 右侧延伸点
            { x: newBox.x, y: newBox.y + newBox.packedHeight, z: newBox.z }, // 上方延伸点
            { x: newBox.x, y: newBox.y, z: newBox.z + newBox.packedWidth }  // 前方延伸点
        ];

        // 3. 过滤并加入合法的极端点
        for (let cp of candidatePoints) {
            // 越界过滤
            if (cp.x >= this.container.length || cp.y >= this.container.height || cp.z >= this.container.width) {
                continue;
            }

            // 检查该候选点是否落在其它已有方块内部
            let occluded = false;
            for (let b of this.packedItems) {
                if (cp.x > b.x && cp.x < b.x + b.packedLength &&
                    cp.y > b.y && cp.y < b.y + b.packedHeight &&
                    cp.z > b.z && cp.z < b.z + b.packedWidth) {
                    occluded = true;
                    break;
                }
            }

            if (!occluded) {
                // 去重添加
                const exists = this.extremePoints.some(p => p.x === cp.x && p.y === cp.y && p.z === cp.z);
                if (!exists) {
                    this.extremePoints.push(cp);
                }
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BinPackingEngine;
}
