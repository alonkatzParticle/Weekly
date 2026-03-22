import { NextRequest, NextResponse } from 'next/server'
import { getBoardIds, initDB } from '@/lib/db'

async function mondayQuery(query: string, token: string) {
  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ query }),
  })
  const data = await response.json()
  return data.data
}

export async function GET(req: NextRequest) {
  try {
    await initDB()
    const { searchParams } = new URL(req.url)
    const taskName = searchParams.get('task_name') ?? ''

    const token = process.env.MONDAY_TOKEN
    if (!token) return NextResponse.json({ error: 'No MONDAY_TOKEN' }, { status: 500 })

    const boards = await getBoardIds()
    const boardIds = boards.map((b: any) => b.board_id)

    const results: any[] = []

    for (const boardId of boardIds) {
      const data = await mondayQuery(`
        query {
          boards(ids: [${boardId}]) {
            name
            items_page(limit: 200) {
              items {
                id
                name
                column_values { id type text value }
              }
            }
          }
        }
      `, token)

      const items = data?.boards?.[0]?.items_page?.items ?? []
      const matched = items.filter((item: any) =>
        item.name.toLowerCase().includes(taskName.toLowerCase())
      )

      for (const item of matched) {
        results.push({
          board: data?.boards?.[0]?.name,
          item_id: item.id,
          item_name: item.name,
          columns: item.column_values.map((c: any) => ({
            id: c.id,
            type: c.type,
            text: c.text,
            value: c.value,
          }))
        })
      }
    }

    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
