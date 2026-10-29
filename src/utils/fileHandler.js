/**
 * Excel / PDF Import & Export Handler
 * 基于 SheetJS 与 html2pdf.js 驱动报表生成与批量导入
 */

class FileHandler {
    /**
     * 将装箱优化结果导出为多Sheet规范Excel
     */
    static exportToExcel(container, result) {
        if (!window.XLSX) {
            alert('Excel导出组件未加载完成，请稍后重试');
            return;
        }

        const wb = XLSX.utils.book_new();

        // Sheet 1: 装箱核心指标汇总
        const summaryData = [
            ["OptiPack 3D - 智能多维装箱分析报告"],
            [],
            ["容器参数明细"],
            ["容器规格类型", container.presetName || '自定义'],
            ["容器长度 (mm)", container.length],
            ["容器宽度 (mm)", container.width],
            ["容器高度 (mm)", container.height],
            ["最大载重限制 (kg)", container.maxWeight],
            [],
            ["装箱优化成果指标"],
            ["空间利用率 (%)", `${result.stats.utilizationPercentage}%`],
            ["容器总容积 (m³)", result.stats.totalContainerVolume],
            ["实际载物体积 (m³)", result.stats.packedVolume],
            ["装载总重量 (kg)", result.stats.totalWeight],
            ["成功装入件数", result.stats.packedCount],
            ["空间不足未能装入件数", result.stats.unpackedCount],
            ["提交总件数", result.stats.totalCount]
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        // 暂缓 append wsSummary，先让二维网格俯视图作为默认打开的第一Sheet

        // Sheet 1: 二维俯视装箱排版网格图（精准贴合行业标准二维分布图规范，方便现场工人直接按图施工）
        // 1. 先按纵向深度 X 坐标聚类出所有唯一的物理排段（截面墙 Section Row）
        const xSections = [];
        let curSec = null;
        const sortedByX = [...result.packedItems].sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
        sortedByX.forEach(item => {
            if (!curSec || Math.abs(item.x - curSec.startX) > 750) {
                curSec = { startX: item.x, items: [] };
                xSections.push(curSec);
            }
            curSec.items.push(item);
        });

        // 2. 扫描全局所有物品的起始 Z 坐标，提取并合并极小浮点偏差（<15mm）生成全局物理 Z 轴轨道分布
        const uniqueZs = Array.from(new Set(result.packedItems.map(item => Math.round(item.z)))).sort((a, b) => a - b);
        const zTracks = [];
        uniqueZs.forEach(z => {
            if (zTracks.length === 0 || z - zTracks[zTracks.length - 1] > 15) {
                zTracks.push(z);
            }
        });
        const maxGridCols = zTracks.length;

        // 匹配任意指定 Z 坐标至最近的 zTrack 轨道索引的辅助函数
        const getTrackIndex = (itemZ) => {
            let bestIdx = 0;
            let minDiff = Infinity;
            zTracks.forEach((tz, idx) => {
                const diff = Math.abs(itemZ - tz);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestIdx = idx;
                }
            });
            return bestIdx;
        };

        // 3. 在每一个纵向排段内，按照全局物理 Z 轨道索引将货品精准填入各自的物理列，空隙部分强制留空以防错位
        const processedRows = xSections.map(sec => {
            const gridColsData = new Array(maxGridCols).fill(null).map(() => ({ text: "", bgColor: null, widthMm: 0 }));
            
            // 将当前截面内的货物按最贴近的物理轨道索引进行分类
            const trackItemsMap = new Map();
            sec.items.forEach(item => {
                const tIdx = getTrackIndex(item.z);
                if (!trackItemsMap.has(tIdx)) {
                    trackItemsMap.set(tIdx, []);
                }
                trackItemsMap.get(tIdx).push(item);
            });

            // 遍历并组织每个轨道内的货物垂直堆叠数据
            trackItemsMap.forEach((items, tIdx) => {
                const sortedByY = [...items].sort((a, b) => a.y - b.y);
                const stackGroups = [];
                let maxCellLenMm = 0;
                sortedByY.forEach(b => {
                    const w = b.packedWidth || b.width;
                    const h = b.packedHeight || b.height;
                    const l = b.packedLength || b.length;
                    if (l > maxCellLenMm) maxCellLenMm = l;
                    const isTransverse = b.rotationType && b.rotationType.includes('横向');
                    const isVertical = (b.cylinderOrientation === 'Y') || (b.rotationType && (b.rotationType.includes('竖向') || b.rotationType.includes('竖立') || b.rotationType.includes('只竖放') || b.rotationType.includes('竖放')));
                    const isCylinder = b.shape === 'cylinder' || b.isCylinder;
                    const rotSuffix = isCylinder ? (isVertical ? '竖' : '') : (isTransverse ? '横' : (isVertical ? '竖' : ''));
                    const dimStr = isCylinder ? `Φ${w}*${l}` : `${w}*${h}*${l}`;
                    if (stackGroups.length > 0 && stackGroups[stackGroups.length - 1].dimStr === dimStr && stackGroups[stackGroups.length - 1].rotSuffix === rotSuffix) {
                        stackGroups[stackGroups.length - 1].count += 1;
                    } else {
                        stackGroups.push({ dimStr, count: 1, color: b.color, widthMm: w, rotSuffix });
                    }
                });

                const text = stackGroups.map(g => `${g.dimStr}*${g.count}${g.rotSuffix}`).join('\n');
                let bgColor = null;
                const uniqueDims = new Set(stackGroups.map(g => g.dimStr));
                if (uniqueDims.size > 1) {
                    bgColor = "FFFFFF"; // 不同规格混装展示为白色
                } else if (stackGroups[0] && stackGroups[0].color) {
                    let hexStr = String(stackGroups[0].color).trim();
                    if (hexStr.startsWith('#')) hexStr = hexStr.replace('#', '');
                    if (/^[0-9A-F]{6}$/i.test(hexStr)) bgColor = hexStr.toUpperCase();
                }
                gridColsData[tIdx] = { text, bgColor, widthMm: stackGroups[0]?.widthMm || 0, lenMm: maxCellLenMm };
            });

            // 过滤掉所有空白单元格，并向左靠齐紧贴合并 (如 a 空 空 b 改成 ab)
            const nonEmptyCols = gridColsData.filter(gc => gc && gc.text && gc.text.trim() !== "");
            while (nonEmptyCols.length < maxGridCols) {
                nonEmptyCols.push({ text: "", bgColor: null, widthMm: 0, lenMm: 0 });
            }

            // 计算排段最大纵向长度和数量
            let maxLenMm = 0;
            let totalCount = sec.items.length;
            sec.items.forEach(item => {
                const l = item.packedLength || item.length;
                if (l > maxLenMm) maxLenMm = l;
            });

            return {
                lenMeter: parseFloat((maxLenMm / 1000).toFixed(2)),
                count: totalCount,
                gridColsData: nonEmptyCols
            };
        });

        // 4. 构建表头及各列宽度标签（动态计算各个左移紧靠后的物理列的最大摆放货物宽度作为列宽度值）
        const matrixData = [];
        const headerRow = new Array(maxGridCols + 3).fill("");
        headerRow[1] = `宽${parseFloat((container.width / 1000).toFixed(2))}`;
        
        const trackWidths = new Array(maxGridCols).fill(0);
        processedRows.forEach(pr => {
            pr.gridColsData.forEach((gc, cIdx) => {
                if (gc && gc.widthMm) {
                    trackWidths[cIdx] = Math.max(trackWidths[cIdx], gc.widthMm);
                }
            });
        });

        trackWidths.forEach((tw, tIdx) => {
            headerRow[2 + tIdx] = tw ? parseFloat((tw / 1000).toFixed(2)) : "";
        });
        headerRow[maxGridCols + 2] = "数量";
        matrixData.push(headerRow);

        let totalCountSum = 0;
        let maxPackedEndXMm = 0;
        result.packedItems.forEach(item => {
            const endX = item.x + (item.packedLength || item.length);
            if (endX > maxPackedEndXMm) maxPackedEndXMm = endX;
        });

        processedRows.forEach((pr, idx) => {
            totalCountSum += pr.count;
            const rowArr = new Array(maxGridCols + 3).fill("");
            if (idx === 0) rowArr[0] = `长${parseFloat((container.length / 1000).toFixed(2))}`;
            rowArr[1] = pr.lenMeter;
            pr.gridColsData.forEach((gc, cIdx) => {
                rowArr[2 + cIdx] = gc.text || "";
            });
            rowArr[maxGridCols + 2] = pr.count;
            matrixData.push(rowArr);
        });

        // 统计每一列（每个物理列）的独立累加长度（取该列每个有效单元格内的最大物品长度之和）
        const colLenSumsMm = new Array(maxGridCols).fill(0);
        processedRows.forEach(pr => {
            pr.gridColsData.forEach((gc, cIdx) => {
                if (gc && gc.lenMm) {
                    colLenSumsMm[cIdx] += gc.lenMm;
                }
            });
        });

        // 5. 底部合计行（B列显示长度相加 SUM 函数，C、D、E...列各自独立计算该列所有单元格长度求和，最右列件数求和）
        const bottomRow = new Array(maxGridCols + 3).fill("");
        bottomRow[0] = "合计";
        colLenSumsMm.forEach((sumMm, cIdx) => {
            if (sumMm > 0) {
                bottomRow[2 + cIdx] = parseFloat((sumMm / 1000).toFixed(2));
            }
        });
        matrixData.push(bottomRow);

        const wsGrid = XLSX.utils.aoa_to_sheet(matrixData);
        const colsConfig = [{ wch: 10 }, { wch: 8 }];
        for (let i = 0; i < maxGridCols; i++) colsConfig.push({ wch: 20 });
        colsConfig.push({ wch: 10 });
        wsGrid['!cols'] = colsConfig;

        // 注入底部合计公式（长度相加 SUM 公式及件数 SUM 公式）
        const lastRowIdx = processedRows.length + 2; // Excel 真实行号（从 1 开始）
        const lenSumAddr = `B${lastRowIdx}`;
        const totalLenSumVal = parseFloat(processedRows.reduce((acc, pr) => acc + (pr.lenMeter || 0), 0).toFixed(2));
        wsGrid[lenSumAddr] = {
            t: 'n',
            f: `SUM(B2:B${lastRowIdx - 1})`,
            v: totalLenSumVal
        };

        const cntColLetter = XLSX.utils.encode_col(maxGridCols + 2);
        const cntSumAddr = `${cntColLetter}${lastRowIdx}`;
        wsGrid[cntSumAddr] = {
            t: 'n',
            f: `SUM(${cntColLetter}2:${cntColLetter}${lastRowIdx - 1})`,
            v: totalCountSum
        };

        if (wsGrid[`A${lastRowIdx}`]) {
            wsGrid[`A${lastRowIdx}`].s = {
                alignment: { horizontal: 'center', vertical: 'center' },
                font: { bold: true }
            };
        }
        wsGrid[lenSumAddr].s = {
            fill: { fgColor: { rgb: "E0F2FE" } },
            alignment: { horizontal: 'center', vertical: 'center' },
            font: { bold: true }
        };

        // 为每一个有数据的物理列底部合计赋予明显的淡蓝高亮和加粗样式
        for (let cIdx = 0; cIdx < maxGridCols; cIdx++) {
            if (colLenSumsMm[cIdx] > 0) {
                const cellAddr = XLSX.utils.encode_cell({ r: lastRowIdx - 1, c: 2 + cIdx });
                if (wsGrid[cellAddr]) {
                    wsGrid[cellAddr].s = {
                        fill: { fgColor: { rgb: "E0F2FE" } },
                        alignment: { horizontal: 'center', vertical: 'center' },
                        font: { bold: true, color: { rgb: "0369A1" } }
                    };
                }
            }
        }

        // 5. 注入单元格背景色与排版样式（兼容支持样式渲染的 SheetJS 引擎）
        processedRows.forEach((pr, rIdx) => {
            pr.gridColsData.forEach((gc, cIdx) => {
                const cellAddr = XLSX.utils.encode_cell({ r: rIdx + 1, c: 2 + cIdx });
                const cell = wsGrid[cellAddr];
                if (cell && gc.text && gc.text.trim() !== "") {
                    cell.s = {
                        alignment: { wrapText: true, horizontal: 'center', vertical: 'center' },
                        font: { name: 'Arial', sz: 10, bold: true },
                        border: {
                            top: { style: 'thin', color: { rgb: 'B0B0B0' } },
                            bottom: { style: 'thin', color: { rgb: 'B0B0B0' } },
                            left: { style: 'thin', color: { rgb: 'B0B0B0' } },
                            right: { style: 'thin', color: { rgb: 'B0B0B0' } }
                        }
                    };
                    if (gc.bgColor) cell.s.fill = { fgColor: { rgb: gc.bgColor } };
                }
            });
        });

        // 为最右侧数量统计列上黄色底提示（含底部合计公式行）
        for (let r = 1; r <= processedRows.length + 2; r++) {
            const cntAddr = XLSX.utils.encode_cell({ r, c: maxGridCols + 2 });
            const cntCell = wsGrid[cntAddr];
            if (cntCell) {
                cntCell.s = {
                    fill: { fgColor: { rgb: "FFFF00" } },
                    alignment: { horizontal: 'center', vertical: 'center' },
                    font: { bold: true }
                };
            }
        }

        XLSX.utils.book_append_sheet(wb, wsGrid, "二维俯视施工图");
        XLSX.utils.book_append_sheet(wb, wsSummary, "装箱汇总指标");

        // 新增：已放入物品汇总清单
        const packedSummaryMap = new Map();
        result.packedItems.forEach(item => {
            const isTransverse = item.rotationType && item.rotationType.includes('横向');
            const isVertical = (item.cylinderOrientation === 'Y') || (item.rotationType && (item.rotationType.includes('竖向') || item.rotationType.includes('竖立') || item.rotationType.includes('只竖放') || item.rotationType.includes('竖放')));
            const isCylinder = item.shape === 'cylinder' || item.isCylinder;
            const rotSuffix = isCylinder ? (isVertical ? '竖' : '') : (isTransverse ? '横' : (isVertical ? '竖' : ''));
            const dimStr = isCylinder ? `Φ${item.width || item.diameter}×L${item.length}${rotSuffix}` : `${item.width}×${item.height}×${item.length}${rotSuffix}`;
            const key = `${item.name}_${item.width}_${item.height}_${item.length}_${item.weight}_${rotSuffix}_${isCylinder}`;
            if (packedSummaryMap.has(key)) {
                packedSummaryMap.get(key).count++;
            } else {
                packedSummaryMap.set(key, {
                    name: item.name,
                    dimensions: dimStr,
                    weight: item.weight,
                    count: 1
                });
            }
        });

        const packedSummaryHeaders = ["物品名称", "规格尺寸(W×H×L mm / ΦD×L)", "单件重量(kg)", "已放入数量(件)", "小计重量(kg)"];
        const packedSummaryRows = Array.from(packedSummaryMap.values()).map(item => [
            item.name,
            item.dimensions,
            item.weight,
            item.count,
            parseFloat((item.weight * item.count).toFixed(2))
        ]);
        const wsPackedSummary = XLSX.utils.aoa_to_sheet([packedSummaryHeaders, ...packedSummaryRows]);
        XLSX.utils.book_append_sheet(wb, wsPackedSummary, "已放入物品汇总清单");

        // 单件逐个施工流水表
        const packedHeaders = ["装箱动作序号", "货物UID", "物品名称", "单件尺寸(W×H×L mm / ΦD×L)", "单件重量(kg)", "空间X坐标(mm)", "空间Y坐标(mm)", "空间Z坐标(mm)", "摆放方向"];
        const packedRows = result.packedItems.map(item => {
            const isTransverse = item.rotationType && item.rotationType.includes('横向');
            const isVertical = (item.cylinderOrientation === 'Y') || (item.rotationType && (item.rotationType.includes('竖向') || item.rotationType.includes('竖立') || item.rotationType.includes('只竖放') || item.rotationType.includes('竖放')));
            const isCylinder = item.shape === 'cylinder' || item.isCylinder;
            const rotSuffix = isCylinder ? (isVertical ? '竖' : '') : (isTransverse ? '横' : (isVertical ? '竖' : ''));
            const dimDisplay = isCylinder ? `Φ${item.packedWidth || item.width}×L${item.packedHeight || item.length}${rotSuffix}` : `${item.packedWidth || item.width}×${item.packedHeight || item.height}×${item.packedLength || item.length}${rotSuffix}`;
            return [
                item.stepIndex,
                item.uid,
                item.name,
                dimDisplay,
                item.weight,
                item.x,
                item.y,
                item.z,
                item.rotationType
            ];
        });
        const wsPacked = XLSX.utils.aoa_to_sheet([packedHeaders, ...packedRows]);
        XLSX.utils.book_append_sheet(wb, wsPacked, "逐件动作流水明细");

        // Sheet 3: 未能装下清单 (如有)
        if (result.unpackedItems && result.unpackedItems.length > 0) {
            const unpackedHeaders = ["货物UID", "物品名称", "单件尺寸(W×H×L mm / ΦD×L)", "单重(kg)", "未能装入原因"];
            const unpackedRows = result.unpackedItems.map(item => {
                const isCylinder = item.shape === 'cylinder' || item.isCylinder;
                const dimDisplay = isCylinder ? `Φ${item.width || item.diameter}×L${item.length}` : `${item.width}×${item.height}×${item.length}`;
                return [
                    item.uid || item.name,
                    item.name,
                    dimDisplay,
                    item.weight,
                    item.reason
                ];
            });
            const wsUnpacked = XLSX.utils.aoa_to_sheet([unpackedHeaders, ...unpackedRows]);
            XLSX.utils.book_append_sheet(wb, wsUnpacked, "未装下溢出清单");
        }

        // 保存文件
        const dateStr = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `OptiPack3D_装箱方案报告_${dateStr}.xlsx`);
    }

    /**
     * 生成图文并茂的施工指导书 PDF
     */
    static exportToPDF(container, result, canvasDomElement) {
        if (!window.html2pdf) {
            alert('PDF生成组件正在初始化，请稍后重试');
            return;
        }

        // 捕获3D渲染图
        const canvasImage = canvasDomElement.querySelector('canvas').toDataURL('image/png');

        // 构建一个隐藏的高清打印排版DOM
        const printContainer = document.createElement('div');
        printContainer.style.padding = '30px';
        printContainer.style.background = '#ffffff';
        printContainer.style.color = '#1e293b';
        printContainer.style.fontFamily = 'sans-serif';
        printContainer.style.width = '800px';

        printContainer.innerHTML = `
            <div style="border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <h1 style="font-size: 24px; color: #1e40af; margin: 0;">OptiPack 3D 装箱作业指导书</h1>
                    <p style="font-size: 12px; color: #64748b; margin: 5px 0 0 0;">智能多维空间优化排列报告</p>
                </div>
                <div style="font-size: 12px; color: #64748b;">生成日期: ${new Date().toLocaleDateString()}</div>
            </div>

            <div style="display: flex; gap: 20px; margin-bottom: 25px;">
                <div style="flex: 1; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <h3 style="font-size: 14px; margin: 0 0 10px 0; color: #334155;">容器空间参数</h3>
                    <div style="font-size: 12px; line-height: 1.8;">
                        <div><strong>规格：</strong> ${container.presetName || '自定义'}</div>
                        <div><strong>内部尺寸 (W×H×L)：</strong> ${container.width} × ${container.height} × ${container.length} mm</div>
                        <div><strong>承重上限：</strong> ${container.maxWeight} kg</div>
                    </div>
                </div>

                <div style="flex: 1; background: #eff6ff; padding: 15px; border-radius: 8px; border: 1px solid #bfdbfe;">
                    <h3 style="font-size: 14px; margin: 0 0 10px 0; color: #1d4ed8;">优化综合指标</h3>
                    <div style="font-size: 12px; line-height: 1.8;">
                        <div><strong>空间利用率：</strong> <span style="font-size: 16px; font-weight: bold; color: #2563eb;">${result.stats.utilizationPercentage}%</span></div>
                        <div><strong>实际装载重量：</strong> ${result.stats.totalWeight} kg</div>
                        <div><strong>装箱总件数：</strong> ${result.stats.packedCount} / ${result.stats.totalCount} 件</div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 25px; text-align: center; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #0f172a;">
                <img src="${canvasImage}" style="max-width: 100%; height: auto; border-radius: 4px;" />
                <div style="font-size: 11px; color: #94a3b8; margin-top: 8px;">3D 空间摆放透视预览图</div>
            </div>

            <h3 style="font-size: 16px; color: #1e293b; margin-bottom: 12px;">纵向筑柱直叠施工指导清单 (前30柱)</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                <thead>
                    <tr style="background: #f1f5f9; color: #475569;">
                        <th style="padding: 8px; border: 1px solid #e2e8f0;">柱体序号</th>
                        <th style="padding: 8px; border: 1px solid #e2e8f0;">物品名称</th>
                        <th style="padding: 8px; border: 1px solid #e2e8f0;">纵叠图例规格 (W*H*L*高度叠数)</th>
                        <th style="padding: 8px; border: 1px solid #e2e8f0;">单柱总重</th>
                        <th style="padding: 8px; border: 1px solid #e2e8f0;">柱底平面坐标 (X, Z)</th>
                        <th style="padding: 8px; border: 1px solid #e2e8f0;">摆放方向</th>
                    </tr>
                </thead>
                <tbody>
                    ${result.packedItems.filter(i => i.isColumnBase).slice(0, 30).map((item, cIdx) => `
                        <tr>
                            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: bold; color: #2563eb;">#柱${cIdx + 1}</td>
                            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${item.name}</td>
                            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #d97706;">${item.columnSpecString || `${item.packedWidth}*${item.packedHeight}*${item.packedLength}*1`}</td>
                            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${item.weight * (item.columnStackCount || 1)} kg</td>
                            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">(${item.x}, ${item.z})</td>
                            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${item.rotationType}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${result.packedItems.filter(i => i.isColumnBase).length > 30 ? `<div style="font-size: 10px; color: #64748b; margin-top: 5px; text-align: right;">*(其余 ${result.packedItems.filter(i => i.isColumnBase).length - 30} 柱明细请参阅导出的 Excel 完整方案表)*</div>` : ''}
        `;

        const opt = {
            margin:       10,
            filename:     `OptiPack3D_施工指导书_${new Date().getTime()}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(printContainer).save();
    }

    /**
     * 从 Excel 表格智能兼容导入货物清单（支持 W*H*L 复合规格字符串及Model名称继承）
     */
    static importFromExcel(file, callback) {
        if (!window.XLSX) {
            alert('Excel解析组件未加载');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (!rawRows || rawRows.length === 0) {
                    alert('导入的Excel表格内无有效数据');
                    return;
                }

                // 智能检测是否为复合规格模式 (如 W*H*L)
                let isCompactMode = false;
                for (let r of rawRows) {
                    for (let cell of r) {
                        if (cell && String(cell).match(/\d+(?:\.\d+)?\s*[*×xX\-]\s*\d+(?:\.\d+)?\s*[*×xX\-]\s*\d+/)) {
                            isCompactMode = true;
                            break;
                        }
                    }
                    if (isCompactMode) break;
                }

                let parsedItems = [];

                if (isCompactMode) {
                    // 截图格式模式解析：[Model名称, 尺寸字符串 W*H*L, 数量]
                    let currentModelName = "默认群组";
                    let colorMap = {};
                    let colorIndex = 0;

                    rawRows.forEach((row) => {
                        if (!row || row.length === 0) return;
                        const hasData = row.some(c => c !== undefined && c !== null && String(c).trim() !== '');
                        if (!hasData) return;

                        // 检查第0列是否有新的Model名称
                        if (row[0] !== undefined && row[0] !== null && String(row[0]).trim() !== '') {
                            const str0 = String(row[0]).trim();
                            const ignoreKeys = ['model', '型号', '名称', '货物名称', '物品名称', '品名', '规格', '尺寸'];
                            if (!ignoreKeys.includes(str0.toLowerCase())) {
                                currentModelName = str0;
                            }
                        }

                        // 寻找尺寸字符串 W*H*L
                        let dimMatch = null;
                        let dimCol = -1;
                        for (let c = 0; c < row.length; c++) {
                            if (row[c] !== undefined && row[c] !== null) {
                                const m = String(row[c]).match(/(\d+(?:\.\d+)?)\s*[*×xX\-]\s*(\d+(?:\.\d+)?)\s*[*×xX\-]\s*(\d+(?:\.\d+)?)/);
                                if (m) {
                                    dimMatch = { w: parseFloat(m[1]), h: parseFloat(m[2]), l: parseFloat(m[3]) };
                                    dimCol = c;
                                    break;
                                }
                            }
                        }

                        if (dimMatch) {
                            let qty = 1;
                            let weight = 10;
                            let nums = [];
                            for (let c = dimCol + 1; c < row.length; c++) {
                                if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') {
                                    const n = parseFloat(row[c]);
                                    if (!isNaN(n)) nums.push(n);
                                }
                            }
                            if (nums.length >= 1) qty = Math.max(1, Math.round(nums[0]));
                            if (nums.length >= 2) weight = nums[1];

                            const specSig = `${dimMatch.w}x${dimMatch.h}x${dimMatch.l}`;
                            if (!colorMap[currentModelName]) colorMap[currentModelName] = {};
                            let subIdx = colorMap[currentModelName][specSig];
                            if (!subIdx) {
                                subIdx = Object.keys(colorMap[currentModelName]).length + 1;
                                colorMap[currentModelName][specSig] = subIdx;
                            }
                            const derivedName = `${currentModelName}.${subIdx}`;

                            const hue = Math.floor(((parsedItems.length * 137.508) % 360));
                            const specColor = `hsl(${hue}, 80%, 55%)`;

                            parsedItems.push({
                                id: `item_${Date.now()}_${parsedItems.length}`,
                                name: derivedName,
                                width: dimMatch.w,
                                height: dimMatch.h,
                                length: dimMatch.l,
                                weight,
                                quantity: qty,
                                rotatable: true,
                                color: specColor
                            });
                        }
                    });

                } else {
                    // 常规表头模式解析
                    const jsonRows = XLSX.utils.sheet_to_json(worksheet);
                    parsedItems = jsonRows.map((row, idx) => {
                        const name = row['物品名称'] || row['货物名称'] || row['名称'] || row['Name'] || `货物_${idx + 1}`;
                        const length = parseFloat(row['长'] || row['长度'] || row['Length'] || 100);
                        const width = parseFloat(row['宽'] || row['宽度'] || row['Width'] || 100);
                        const height = parseFloat(row['高'] || row['高度'] || row['Height'] || 100);
                        const weight = parseFloat(row['重量'] || row['单重'] || row['Weight'] || 10);
                        const quantity = parseInt(row['数量'] || row['件数'] || row['Quantity'] || 1, 10);
                        const rotRaw = row['允许旋转'] || row['旋转'] || row['Rotatable'];
                        const rotatable = rotRaw === '否' || rotRaw === false || rotRaw === 0 ? false : true;

                        const hue = Math.floor((idx * 137.508) % 360);
                        const color = `hsl(${hue}, 75%, 60%)`;

                        return {
                            id: `item_${Date.now()}_${idx}`,
                            name,
                            length: isNaN(length) ? 100 : length,
                            width: isNaN(width) ? 100 : width,
                            height: isNaN(height) ? 100 : height,
                            weight: isNaN(weight) ? 10 : weight,
                            quantity: isNaN(quantity) ? 1 : quantity,
                            rotatable,
                            color
                        };
                    });
                }

                if (parsedItems.length === 0) {
                    alert('未能在Excel中识别到有效的尺寸规格数据');
                    return;
                }

                callback(parsedItems);
            } catch (err) {
                console.error(err);
                alert('解析Excel失败，请确保格式正确');
            }
        };
        reader.readAsArrayBuffer(file);
    }
}
