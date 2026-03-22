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
        query: `query { users(kind: non_guests) { id name email } }`,
      }),
    })

    const data = await response.json()
    if (data.errors) {
      return NextResponse.json({ error: JSON.stringify(data.errors) }, { status: 500 })
    }

    const users = (data.data?.users ?? []).sort((a: any, b: any) =>
      a.name.localeCompare(b.name)
    )

    return NextResponse.json({ users })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
