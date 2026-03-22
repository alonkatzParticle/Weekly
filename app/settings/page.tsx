'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface TeamMember {
  id?: number
  name: string
  monday_user_id: string
  is_video_team: boolean
}

interface Board {
  id?: number
  board_id: string
  board_name: string
}

interface EnvStatus {
  MONDAY_TOKEN: boolean
  ANTHROPIC_API_KEY: boolean
  DROPBOX_TOKEN: boolean
  DROPBOX_PATH: string
}

interface OrgUser {
  id: string
  name: string
  email: string
}

interface OrgBoard {
  id: string
  name: string
}

export default function SettingsPage() {
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)

  // Org data from Monday.com
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([])
  const [orgBoards, setOrgBoards] = useState<OrgBoard[]>([])
  const [loadingOrgUsers, setLoadingOrgUsers] = useState(false)
  const [loadingOrgBoards, setLoadingOrgBoards] = useState(false)
  const [orgUsersError, setOrgUsersError] = useState('')
  const [orgBoardsError, setOrgBoardsError] = useState('')

  // New member form
  const [selectedUserId, setSelectedUserId] = useState('')
  const [newMemberIsVideo, setNewMemberIsVideo] = useState(false)

  // New board selection
  const [selectedBoardId, setSelectedBoardId] = useState('')

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        setEnvStatus(d.env ?? null)
        setMembers(d.members ?? [])
        setBoards(d.boards ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  const fetchOrgUsers = async () => {
    setLoadingOrgUsers(true)
    setOrgUsersError('')
    try {
      const res = await fetch('/api/monday/org-users')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOrgUsers(data.users ?? [])
    } catch (err) {
      setOrgUsersError(String(err))
    } finally {
      setLoadingOrgUsers(false)
    }
  }

  const fetchOrgBoards = async () => {
    setLoadingOrgBoards(true)
    setOrgBoardsError('')
    try {
      const res = await fetch('/api/monday/org-boards')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setOrgBoards(data.boards ?? [])
    } catch (err) {
      setOrgBoardsError(String(err))
    } finally {
      setLoadingOrgBoards(false)
    }
  }

  const addMember = async () => {
    if (!selectedUserId) return
    const user = orgUsers.find(u => u.id === selectedUserId)
    if (!user) return

    await fetch('/api/settings/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: user.name,
        monday_user_id: user.id,
        is_video_team: newMemberIsVideo,
      }),
    })
    const res = await fetch('/api/settings')
    const d = await res.json()
    setMembers(d.members ?? [])
    setSelectedUserId('')
    setNewMemberIsVideo(false)
  }

  const removeMember = async (id: number) => {
    await fetch('/api/settings/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  const addBoard = async () => {
    if (!selectedBoardId) return
    const board = orgBoards.find(b => b.id === selectedBoardId)
    if (!board) return

    await fetch('/api/settings/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_id: board.id, board_name: board.name }),
    })
    const res = await fetch('/api/settings')
    const d = await res.json()
    setBoards(d.boards ?? [])
    setSelectedBoardId('')
  }

  const removeBoard = async (boardId: string) => {
    await fetch('/api/settings/boards', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_id: boardId }),
    })
    setBoards(prev => prev.filter(b => b.board_id !== boardId))
  }

  // Filter out already-added members/boards from dropdowns
  const addedUserIds = new Set(members.map(m => m.monday_user_id))
  const addedBoardIds = new Set(boards.map(b => b.board_id))
  const availableUsers = orgUsers.filter(u => !addedUserIds.has(u.id))
  const availableBoards = orgBoards.filter(b => !addedBoardIds.has(b.id))

  if (loading)
    return <div className="text-sm text-muted-foreground animate-pulse">Loading settings...</div>

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure API keys, team members, and boards
        </p>
      </div>

      {/* Environment Variables */}
      <Card>
        <CardHeader>
          <CardTitle>Environment Variables</CardTitle>
          <CardDescription>
            API keys are loaded from <code className="bg-muted px-1 rounded text-xs">.env.local</code>. Edit that file to update them — never stored in the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {envStatus ? (
            <div className="space-y-3">
              {[
                { key: 'MONDAY_TOKEN', set: envStatus.MONDAY_TOKEN, desc: 'Monday.com API token' },
                { key: 'ANTHROPIC_API_KEY', set: envStatus.ANTHROPIC_API_KEY, desc: 'Claude AI API key' },
                { key: 'DROPBOX_TOKEN', set: envStatus.DROPBOX_TOKEN, desc: 'Dropbox access token' },
              ].map(({ key, set, desc }) => (
                <div key={key} className="flex items-center gap-3">
                  {set
                    ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                  <div>
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{key}</code>
                    <span className="text-xs text-muted-foreground ml-2">{desc}</span>
                  </div>
                  {!set && (
                    <span className="text-xs text-red-500 ml-auto">Not set</span>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-3 pt-1 border-t">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <div>
                  <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">DROPBOX_PATH</code>
                  <span className="text-xs text-muted-foreground ml-2">Dropbox root folder</span>
                </div>
                <span className="text-xs text-muted-foreground ml-auto">{envStatus.DROPBOX_PATH}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            Select members from your Monday.com organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 border rounded-md">
              <div className="flex-1">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  ID: {m.monday_user_id}
                  {m.is_video_team && ' · Video Team'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500"
                onClick={() => removeMember(m.id!)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="border rounded-md p-4 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Add Team Member</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={fetchOrgUsers}
                disabled={loadingOrgUsers}
              >
                <RefreshCw className={`h-3 w-3 ${loadingOrgUsers ? 'animate-spin' : ''}`} />
                {orgUsers.length === 0 ? 'Load from Monday.com' : 'Refresh'}
              </Button>
            </div>

            {orgUsersError && (
              <p className="text-xs text-red-500">{orgUsersError}</p>
            )}

            {orgUsers.length === 0 && !loadingOrgUsers ? (
              <p className="text-xs text-muted-foreground">
                Click "Load from Monday.com" to fetch your organization's members.
              </p>
            ) : (
              <div className="space-y-3">
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white"
                  disabled={loadingOrgUsers}
                >
                  <option value="">— Select a team member —</option>
                  {availableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newMemberIsVideo}
                    onChange={e => setNewMemberIsVideo(e.target.checked)}
                    className="rounded"
                  />
                  Video Team Member (shows time tracking)
                </label>

                <Button
                  size="sm"
                  onClick={addMember}
                  disabled={!selectedUserId}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Member
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Monday.com Boards */}
      <Card>
        <CardHeader>
          <CardTitle>Monday.com Boards</CardTitle>
          <CardDescription>Select boards to pull tasks from</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {boards.map(b => (
            <div key={b.board_id} className="flex items-center gap-3 p-3 border rounded-md">
              <div className="flex-1">
                <p className="text-sm font-medium">{b.board_name || b.board_id}</p>
                <p className="text-xs text-muted-foreground">ID: {b.board_id}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500"
                onClick={() => removeBoard(b.board_id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="border rounded-md p-4 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Add Board</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={fetchOrgBoards}
                disabled={loadingOrgBoards}
              >
                <RefreshCw className={`h-3 w-3 ${loadingOrgBoards ? 'animate-spin' : ''}`} />
                {orgBoards.length === 0 ? 'Load from Monday.com' : 'Refresh'}
              </Button>
            </div>

            {orgBoardsError && (
              <p className="text-xs text-red-500">{orgBoardsError}</p>
            )}

            {orgBoards.length === 0 && !loadingOrgBoards ? (
              <p className="text-xs text-muted-foreground">
                Click "Load from Monday.com" to fetch your boards.
              </p>
            ) : (
              <div className="space-y-3">
                <select
                  value={selectedBoardId}
                  onChange={e => setSelectedBoardId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white"
                  disabled={loadingOrgBoards}
                >
                  <option value="">— Select a board —</option>
                  {availableBoards.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>

                <Button
                  size="sm"
                  onClick={addBoard}
                  disabled={!selectedBoardId}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Board
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
