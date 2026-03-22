import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
const tokenMatch = env.match(/MONDAY_TOKEN=(.+)/);
const TOKEN = tokenMatch ? tokenMatch[1].trim() : null;

if (!TOKEN) {
  console.log('No token found');
  process.exit(1);
}

const query = `
query {
  items_page_by_column_values(
    limit: 10
    query_params: {
      rules: [{
        column_id: "name"
        compare_value: ["Power Shower Set | META | Easter Sale 2026 Images"]
        operator: contains_text
      }]
    }
  ) {
    items {
      id
      name
      board { name }
      column_values {
        id
        type
        text
        value
      }
    }
  }
}
`;

async function run() {
  try {
    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': TOKEN,
        'Cache-Control': 'no-cache, no-store',
        'API-Version': '2024-01',
      },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();
    const items = data?.data?.items_page_by_column_values?.items ?? [];

    if (items.length === 0) {
      console.log('No relevant items found');
      process.exit(0);
    }

    for (const item of items) {
      console.log(`\n=== Item: "${item.name}" (id: ${item.id}) on board: "${item.board?.name}" ===`);
      const cols = item.column_values ?? [];
      const linkCols = cols.filter(c => c.type === 'link' || (c.text && c.text.includes('dropbox.com')));
      if (linkCols.length === 0) {
        console.log('  No link/dropbox columns found on this item.');
      } else {
        for (const c of linkCols) {
          console.log(`  col id="${c.id}" type="${c.type}"`);
          console.log(`    text: ${c.text}`);
          console.log(`    value: ${c.value}`);
        }
      }
    }
  } catch (e) {
    console.error('Error fetching from Monday:', e);
  }
  process.exit(0);
}

run();
