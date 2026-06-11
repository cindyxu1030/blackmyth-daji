// 开发工具：OBJ 顶点聚类减面器（流式，保 UV 接缝）
// 用法: node decimate-obj.js <in.obj> <out.obj> [gridN=110]
// 算法: 位置按 gridN³ 网格聚类 → 每簇取代表点；输出顶点 = (簇, vt) 唯一对，
//       UV 接缝处同位置不同 vt 会保留为不同输出顶点，贴图不串。
const fs = require('fs');
const readline = require('readline');

const [, , inPath, outPath, gridArg] = process.argv;
if (!inPath || !outPath) { console.error('usage: node decimate-obj.js in.obj out.obj [gridN]'); process.exit(1); }
const GRID = parseInt(gridArg || '110', 10);

const vx = [], vy = [], vz = [];   // 原始顶点
const vtu = [], vtv = [];          // 原始 UV
const faces = [];                  // 三角化后的角：[vi, ti] ×3（ti 可为 -1）

const rl = readline.createInterface({ input: fs.createReadStream(inPath), crlfDelay: Infinity });

function parseCorner(tok) {
  // v / v\/vt / v\/vt\/vn / v\/\/vn → [vIdx0based, vtIdx0based|-1]
  const parts = tok.split('/');
  const vi = parseInt(parts[0], 10) - 1;
  const ti = parts.length > 1 && parts[1] !== '' ? parseInt(parts[1], 10) - 1 : -1;
  return [vi, ti];
}

rl.on('line', (line) => {
  if (line.length < 3) return;
  const c0 = line.charCodeAt(0), c1 = line.charCodeAt(1);
  if (c0 === 118 /* v */ && c1 === 32 /* space */) {
    const p = line.split(/\s+/);
    vx.push(+p[1]); vy.push(+p[2]); vz.push(+p[3]); // 忽略可能附带的顶点色
  } else if (c0 === 118 && c1 === 116 /* vt */) {
    const p = line.split(/\s+/);
    vtu.push(+p[1]); vtv.push(+p[2]);
  } else if (c0 === 102 /* f */ && c1 === 32) {
    const p = line.split(/\s+/).slice(1).filter(Boolean);
    // 扇形三角化 n 边形
    const corners = p.map(parseCorner);
    for (let i = 1; i < corners.length - 1; i++) {
      faces.push(corners[0], corners[i], corners[i + 1]);
    }
  }
});

rl.on('close', () => {
  const nV = vx.length, nT = faces.length / 3;
  // 包围盒
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < nV; i++) {
    if (vx[i] < minX) minX = vx[i]; if (vx[i] > maxX) maxX = vx[i];
    if (vy[i] < minY) minY = vy[i]; if (vy[i] > maxY) maxY = vy[i];
    if (vz[i] < minZ) minZ = vz[i]; if (vz[i] > maxZ) maxZ = vz[i];
  }
  const cell = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / GRID;

  // 位置聚类：cellKey → 簇 id；簇代表点取簇内均值（比首点平滑）
  const cellMap = new Map();
  const vertCluster = new Int32Array(nV);
  const cAccX = [], cAccY = [], cAccZ = [], cCount = [];
  for (let i = 0; i < nV; i++) {
    const ix = Math.floor((vx[i] - minX) / cell), iy = Math.floor((vy[i] - minY) / cell), iz = Math.floor((vz[i] - minZ) / cell);
    const key = ix + iy * (GRID + 2) + iz * (GRID + 2) * (GRID + 2);
    let cid = cellMap.get(key);
    if (cid === undefined) {
      cid = cAccX.length;
      cellMap.set(key, cid);
      cAccX.push(0); cAccY.push(0); cAccZ.push(0); cCount.push(0);
    }
    vertCluster[i] = cid;
    cAccX[cid] += vx[i]; cAccY[cid] += vy[i]; cAccZ[cid] += vz[i]; cCount[cid]++;
  }

  // 输出顶点 = (簇, vt) 唯一对
  const outMap = new Map(); // key = cid * (nVT+1) + (ti+1)
  const outV = [];          // [cid, ti]
  const nVT = vtu.length;
  const outFaces = [];
  for (let f = 0; f < faces.length; f += 3) {
    const c0 = vertCluster[faces[f][0]], c1 = vertCluster[faces[f + 1][0]], c2 = vertCluster[faces[f + 2][0]];
    if (c0 === c1 || c1 === c2 || c0 === c2) continue; // 位置退化
    const idx = [];
    for (let k = 0; k < 3; k++) {
      const cid = vertCluster[faces[f + k][0]];
      const ti = faces[f + k][1];
      const key = cid * (nVT + 1) + (ti + 1);
      let oi = outMap.get(key);
      if (oi === undefined) {
        oi = outV.length;
        outMap.set(key, oi);
        outV.push([cid, ti]);
      }
      idx.push(oi);
    }
    outFaces.push(idx);
  }

  // 写出
  const out = fs.createWriteStream(outPath);
  out.write('# decimated by decimate-obj.js grid=' + GRID + '\n');
  out.write('mtllib model.mtl\nusemtl material_0\n');
  for (const [cid] of outV) {
    const n = cCount[cid];
    out.write('v ' + (cAccX[cid] / n).toFixed(5) + ' ' + (cAccY[cid] / n).toFixed(5) + ' ' + (cAccZ[cid] / n).toFixed(5) + '\n');
  }
  for (const [, ti] of outV) {
    out.write('vt ' + (ti >= 0 ? vtu[ti].toFixed(5) + ' ' + vtv[ti].toFixed(5) : '0 0') + '\n');
  }
  for (const fc of outFaces) {
    out.write('f ' + (fc[0] + 1) + '/' + (fc[0] + 1) + ' ' + (fc[1] + 1) + '/' + (fc[1] + 1) + ' ' + (fc[2] + 1) + '/' + (fc[2] + 1) + '\n');
  }
  out.end(() => {
    console.log(JSON.stringify({
      inVerts: nV, inTris: nT,
      outVerts: outV.length, outTris: outFaces.length,
      grid: GRID,
    }));
  });
});
