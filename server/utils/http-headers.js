/**
 * Хелпер для HTTP-заголовков скачивания файлов.
 *
 * Node.js (HTTP/1.1) требует, чтобы значения заголовков были ASCII-безопасными.
 * Кириллица в `Content-Disposition` вызывает:
 *   TypeError [ERR_INVALID_CHAR]: Invalid character in header content
 *
 * Решение: ASCII-имя в `filename=` + UTF-8-имя в `filename*` (RFC 5987).
 * Современные браузеры используют `filename*`, старые — ASCII-версию.
 */

'use strict';

function setAttachmentHeaders(res, asciiFilename, utf8Filename) {
  const ascii = String(asciiFilename).replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', 'attachment; filename="' + ascii + '"');
  if (utf8Filename) {
    const encoded = encodeURIComponent(String(utf8Filename));
    res.setHeader('Content-Disposition', 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encoded);
  }
}

/** Имя файла вида robotics_calc_YYYY-MM-DD.pdf */
function datedFilename(base, ext) {
  return base + '_' + new Date().toISOString().slice(0, 10) + '.' + ext;
}

module.exports = { setAttachmentHeaders, datedFilename };
