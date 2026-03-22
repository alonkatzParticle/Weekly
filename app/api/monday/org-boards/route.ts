import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const token = process.env.MONDAY_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'MONDAY_TOKEN is not set in environment variables' }, { status: 500 })
    }

    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify({
        query: `query { boards(limit: 100, order_by: created_at) { id name } }`,
      }),
    })

    const data = await response.json()
    if (data.errors) {
      return NextResponse.json({ error: JSON.stringify(data.errors) }, { status: 500 })
    }

    const boards = (data.data?.boards ?? []).sort((a: any, b: any) =>
      a.name.localeCompare(b.name)
    )

    return NextResponse.json({ boards })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
