# Kolom Keterangan (Excel ⇄ Web)

Kolom **Keterangan** ada di file Excel hasil tombol **Export Excel** pada halaman
Deadline (kolom **H**), diisi bebas oleh tim produksi, lalu dibaca kembali saat
file diunggah lewat **Unggah ceklis**.

## Aturan utama: teks disimpan apa adanya

Isi kolom Keterangan disimpan **persis seperti yang diketik**, tanpa diubah:

- spasi ganda tetap spasi ganda
- baris baru (Enter/Alt+Enter di Excel) tetap jadi baris baru
- tanda kutip, `&`, `<`, `>`, `%`, `✓` tetap apa adanya
- spasi di awal baris tetap ada

Satu-satunya penyeragaman: baris baru gaya Windows (`\r\n`) dijadikan `\n` agar
tidak menyisakan karakter tak terlihat.

Sel yang isinya hanya spasi dianggap kosong.

Batas keamanan 20.000 karakter per sel (batas Excel sendiri 32.767). Kalau
terlampaui, teks dipotong DAN dilaporkan di pesan hasil unggah — tidak dipotong
diam-diam.

## Bukti uji

Teks uji 187 karakter berisi baris baru, spasi ganda, tanda kutip, `&`, `< >`,
dan `✓`:

```
panjang diketik  : 187
panjang tersimpan: 187
SAMA PERSIS      : YA ✓

export ulang membawa teks sama: YA ✓
```

## Perilaku saat unggah

| Keadaan sel | Akibat |
|---|---|
| ada teks, sebelumnya kosong | disimpan |
| ada teks, sebelumnya beda | ditimpa |
| dikosongkan | keterangan dihapus (`NULL`) |
| hanya spasi | dianggap kosong |
| file lama tanpa kolom Keterangan | catatan lama **tidak disentuh** |

Perbandingan dilakukan terhadap isi database, bukan terhadap ada/tidaknya teks,
sehingga mengosongkan keterangan benar-benar terdeteksi sebagai perubahan.

## Tampilan di web

Kolom **Keterangan** ada di tabel Deadline (antara Tenggat dan Status sumber),
maksimal 2 baris dengan elipsis, dan teks lengkapnya muncul saat kursor diarahkan
ke sel. Baris baru dihormati (`whitespace-pre-line`).

## Ekspor ulang

Keterangan yang sudah tersimpan ikut terbawa saat file diekspor lagi, jadi file
bisa diunduh dan diunggah berkali-kali tanpa kehilangan catatan.

## Kolom Excel lengkap

| Kolom | Isi |
|---|---|
| A | No. Pesanan |
| B | Pelanggan |
| C | Cabang |
| D | Produk |
| E | Tanggal Masuk |
| F | Tenggat |
| G | Ceklis (dropdown ✓) |
| H | Keterangan (teks bebas) |
