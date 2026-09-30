"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useMemo } from "react";

const columnHelper = createColumnHelper<never>();

/** TanStack Table wrapper with the admin table styling. */
export function DataTable<T>({
  data,
  columns,
  emptyMessage = "Nothing here yet",
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  emptyMessage?: string;
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  void columnHelper;
  const headerGroups = useMemo(() => table.getHeaderGroups(), [table]);

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
      <table className="table-base">
        <thead>
          {headerGroups.map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th key={header.id} scope="col">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-10 text-center text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
