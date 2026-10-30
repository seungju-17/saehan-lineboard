import * as XLSX from 'xlsx';
import type { Board } from './repo';
import { fmtKo } from './shift';

/** 실제 배치표 양식: 라인 | 생산제품명 | 근무자 */
export function boardToXlsx(board: Board, factoryName: string): Buffer {
  const rows: (string | null)[][] = [
    [`${factoryName} 인원 배치표`, '', ''],
    [`${fmtKo(board.date)} ${board.shift}`, '', board.status],
    [],
    ['Line & 운반', '생산제품명', '근무자'],
  ];
  for (const p of board.posts) {
    const names = board.assignments.filter((a) => a.post_id === p.id).map((a) => a.name).join(', ');
    if (p.kind === 'machine' && !p.product && !names) { rows.push([p.name, '', '']); continue; }
    rows.push([p.name, p.product ?? '', names]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 40 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${board.date} ${board.shift}`);
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}
