"use client";
import { useMemo } from "react";
import {
  useTable,
  tableFeatures,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import Link from "next/link";
import type { Order } from "@/types";
import { Badge, Empty } from "./common";
import { displayDate } from "@/lib/display";
export function OrdersTable({
  rows,
  timezone = "Asia/Damascus",
  dateFormat = "dd/MM/yyyy",
}: {
  rows: Order[];
  timezone?: string;
  dateFormat?: string;
}) {
  const columns = useMemo<ColumnDef<ReturnType<typeof tableFeatures>, Order>[]>(
    () => [
      {
        accessorKey: "order_number",
        header: "رقم الطلب",
        cell: ({ row }) => (
          <Link
            style={{ color: "var(--primary)", fontWeight: 650 }}
            href={`/admin/orders/${row.original.id}`}
          >
            {row.original.order_number}
          </Link>
        ),
      },
      {
        accessorKey: "customer_name",
        header: "العميل",
        cell: ({ row }) => (
          <div className="row">
            <span
              className="avatar"
              style={{ width: 30, height: 30, fontSize: 11 }}
            >
              {row.original.customer_name.slice(0, 1)}
            </span>
            <div>
              {row.original.customer_name}
              <span
                className="muted"
                style={{
                  display: "block",
                  fontSize: 10,
                  direction: "ltr",
                  textAlign: "right",
                }}
              >
                {row.original.phone}
              </span>
            </div>
          </div>
        ),
      },
      { accessorKey: "item_name", header: "الخدمة / الحملة" },
      {
        accessorKey: "amount",
        header: "المبلغ",
        cell: ({ row }) => (
          <span dir="ltr">
            {row.original.amount} {row.original.currency}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "الحالة",
        cell: ({ getValue }) => <Badge value={String(getValue())} />,
      },
      {
        accessorKey: "created_at",
        header: "التاريخ",
        cell: ({ getValue }) =>
          displayDate(String(getValue()), timezone, dateFormat),
      },
    ],
    [timezone, dateFormat],
  );
  const table = useTable({ features: tableFeatures({}), data: rows, columns });
  return !rows.length ? (
    <Empty
      title="لا توجد طلبات بعد"
      description="ستظهر الطلبات الحقيقية هنا بمجرد تقديمها من روابط خدماتك وحملاتك."
    />
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          {table.getHeaderGroups().map((h) => (
            <tr key={h.id}>
              {h.headers.map((c) => (
                <th key={c.id}>
                  {flexRender(c.column.columnDef.header, c.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id}>
              {r.getAllCells().map((c) => (
                <td key={c.id}>
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
