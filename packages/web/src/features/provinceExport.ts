import { displayVernacular } from '../domain/vernacular';
import type { TableRow } from './ProvinceTable';

interface Labels {
  sciName: string;
  vernacular: string;
  family: string;
  habit: string;
  endemic: string;
  iucn: string;
  flowering: string;
  records: string;
  image: string;
  yes: string;
  no: string;
  missing: string;
  openImage: string;
  placeholder: string;
}

/**
 * İl tablosunu gerçek bir .xlsx dosyasına yazar ve indirir.
 *
 * `exceljs` yalnızca burada, kullanıcı gerçekten "Excel'e aktar"a bastığında
 * yüklenir (dinamik import) — ~1 MB'lık kütüphane ana paketi şişirmesin diye.
 * Görseller dış barındırıcılardan (iNaturalist/GBIF) geldiği için CORS
 * kısıtları yüzünden ikili gömme güvenilir değildir; bu yüzden görsel hücresi
 * asıl fotoğrafa tıklanabilir bir bağlantı olarak eklenir, ikili veri gömülmez.
 */
export async function buildProvinceWorkbook(
  province: string,
  rows: TableRow[],
  labels: Labels,
  language: string,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(province.slice(0, 31));

  sheet.columns = [
    { header: labels.sciName, key: 'sci', width: 32 },
    { header: labels.vernacular, key: 'vernacular', width: 22 },
    { header: labels.family, key: 'family', width: 18 },
    { header: labels.habit, key: 'habit', width: 16 },
    { header: labels.endemic, key: 'endemic', width: 10 },
    { header: labels.iucn, key: 'iucn', width: 10 },
    { header: labels.flowering, key: 'flowering', width: 18 },
    { header: labels.records, key: 'records', width: 14 },
    { header: labels.image, key: 'image', width: 42 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const excelRow = sheet.addRow({
      sci: [row.node.name, row.node.authorship].filter(Boolean).join(' '),
      vernacular: displayVernacular(row.node, language) ?? '',
      family: row.family ?? '',
      habit: row.habit ?? labels.missing,
      endemic: row.isEndemic ? labels.yes : labels.no,
      iucn: row.iucn ?? labels.missing,
      flowering: row.flowering ?? labels.missing,
      records: row.records,
    });

    const imageCell = excelRow.getCell('image');
    if (row.fullImageUrl) {
      imageCell.value = { text: labels.openImage, hyperlink: row.fullImageUrl };
      imageCell.font = { color: { argb: 'FF1F6FEB' }, underline: true };
    } else {
      imageCell.value = labels.placeholder;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${province}-bitkiler.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
