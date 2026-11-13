import { redirect } from "next/navigation";

/**
 * Menu Orderan sudah dihapus (Derril tidak memerlukannya).
 * Halaman ini dipertahankan hanya sebagai pengalihan agar tautan lama tidak 404.
 */
export default function OrdersPage() {
  redirect("/deadline");
}
