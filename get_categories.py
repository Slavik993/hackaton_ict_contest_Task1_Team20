import csv

with open(r'C:\Users\Machcreator\Desktop\Robo Visual\case-01-robotic-solutions-platform-team-20\catalog_export_v4.csv', 'r', encoding='utf-8-sig') as f:
    reader = csv.reader(f, delimiter=';')
    next(reader)
    categories = set()
    subtypes = set()
    for row in reader:
        if len(row) > 7:
            cat = row[6].strip() if row[6] else ''
            sub = row[7].strip() if row[7] else ''
            if cat: categories.add(cat)
            if sub: subtypes.add(sub)

with open('categories_output.txt', 'w', encoding='utf-8') as out:
    out.write('Categories:\n')
    for c in sorted(categories):
        out.write(f'  {c}\n')
    out.write('\nSubtypes:\n')
    for s in sorted(subtypes):
        out.write(f'  {s}\n')