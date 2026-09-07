-- La app interna firma tanto las recargas como los cobros de PLANES (que agrupan varias apps),
-- así que su nombre en el listado de Cobros ya no puede hablar solo de recargas.
UPDATE apps SET name = 'Sistema · Marketplace' WHERE system = true AND name <> 'Sistema · Marketplace';
