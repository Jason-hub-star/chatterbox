import { beforeEach, describe, expect, it } from 'vitest'
import { useNotesStore, type DirectorNote } from '@/stores/notesStore'

const note = (i: number): DirectorNote => ({ id: String(i), authorId: 'a', authorName: 'A', content: `n${i}`, ts: i })

describe('notesStore (ROOM-17)', () => {
  beforeEach(() => useNotesStore.getState().clearNotes())

  it('addNote: 시간순 누적', () => {
    useNotesStore.getState().addNote(note(1))
    useNotesStore.getState().addNote(note(2))
    expect(useNotesStore.getState().notes.map((n) => n.id)).toEqual(['1', '2'])
  })

  it('상한 초과 시 앞에서 버림(최근 보존)', () => {
    for (let i = 0; i < 305; i++) useNotesStore.getState().addNote(note(i))
    const notes = useNotesStore.getState().notes
    expect(notes).toHaveLength(300)
    expect(notes[notes.length - 1].id).toBe('304')
  })

  it('clearNotes: 노트 비움 + autoScroll 복원', () => {
    useNotesStore.getState().addNote(note(1))
    useNotesStore.getState().setAutoScroll(false)
    useNotesStore.getState().clearNotes()
    expect(useNotesStore.getState().notes).toHaveLength(0)
    expect(useNotesStore.getState().isAutoScroll).toBe(true)
  })
})
