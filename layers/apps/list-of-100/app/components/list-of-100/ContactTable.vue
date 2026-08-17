<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ListContact, FaithStatus, Relationship } from '../../utils/list-of-100-types'
import { FAITH_STATUSES, RELATIONSHIPS, relativeTime } from '../../utils/list-of-100-types'

defineProps<{
  contacts: ListContact[]
}>()

const emit = defineEmits<{
  edit: [contact: ListContact]
  delete: [contact: ListContact]
  'mark-contacted': [id: string]
  'mark-prayed': [id: string]
}>()

const faithLabel = (s: FaithStatus) => FAITH_STATUSES.find(f => f.value === s)?.label ?? s
const faithColor = (s: FaithStatus) => FAITH_STATUSES.find(f => f.value === s)?.color ?? 'neutral'
const relLabel = (r: Relationship) => RELATIONSHIPS.find(x => x.value === r)?.label ?? r

const columns: TableColumn<ListContact>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'relationship', header: 'Relationship' },
  { accessorKey: 'faith_status', header: 'Faith' },
  { accessorKey: 'last_contacted_at', header: 'Contacted' },
  { accessorKey: 'last_prayed_at', header: 'Prayed' },
  { accessorKey: 'notes', header: 'Notes' },
  { id: 'actions', header: '' }
]

function rowActions(contact: ListContact) {
  return [
    [
      {
        label: 'Edit',
        icon: 'i-lucide-pencil',
        onSelect: () => emit('edit', contact)
      },
      {
        label: 'Delete',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => emit('delete', contact)
      }
    ]
  ]
}
</script>

<template>
  <div>
    <!-- Desktop / tablet: full table -->
    <div class="hidden md:block overflow-x-auto">
      <UTable :data="contacts" :columns="columns" class="w-full">
        <template #name-cell="{ row }">
          <button
            type="button"
            class="font-medium text-left hover:text-(--ui-primary) hover:underline focus:outline-none focus-visible:underline"
            @click="emit('edit', row.original)"
          >
            {{ row.original.name }}
          </button>
        </template>

        <template #relationship-cell="{ row }">
          <span class="text-sm text-(--ui-text-muted)">{{ relLabel(row.original.relationship) }}</span>
        </template>

        <template #faith_status-cell="{ row }">
          <UBadge
            :label="faithLabel(row.original.faith_status)"
            :color="faithColor(row.original.faith_status)"
            variant="soft"
            size="sm"
          />
        </template>

        <template #last_contacted_at-cell="{ row }">
          <UButton
            icon="i-lucide-message-circle"
            variant="soft"
            color="info"
            size="sm"
            @click="emit('mark-contacted', row.original.id)"
          >
            {{ relativeTime(row.original.last_contacted_at) }}
          </UButton>
        </template>

        <template #last_prayed_at-cell="{ row }">
          <UButton
            icon="i-lucide-hand-heart"
            variant="soft"
            color="success"
            size="sm"
            @click="emit('mark-prayed', row.original.id)"
          >
            {{ relativeTime(row.original.last_prayed_at) }}
          </UButton>
        </template>

        <template #notes-cell="{ row }">
          <span class="text-sm text-(--ui-text-muted) line-clamp-1 max-w-xs">
            {{ row.original.notes }}
          </span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end">
            <UDropdownMenu :items="rowActions(row.original)">
              <UButton
                icon="i-lucide-more-horizontal"
                variant="ghost"
                color="neutral"
                size="sm"
                square
                aria-label="More actions"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #empty>
          <div
            data-testid="contacts-empty-state"
            class="py-12 text-center text-(--ui-text-muted)"
          >
            Your list is empty. Click "Add contact" to begin.
          </div>
        </template>
      </UTable>
    </div>

    <!-- Mobile: card stack -->
    <div class="md:hidden space-y-3">
      <div
        v-for="c in contacts"
        :key="c.id"
        class="rounded-lg border border-(--ui-border) bg-(--ui-bg) p-3"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <button
              type="button"
              class="font-medium truncate block text-left hover:text-(--ui-primary) hover:underline focus:outline-none focus-visible:underline"
              @click="emit('edit', c)"
            >
              {{ c.name }}
            </button>
            <div class="mt-1 flex items-center gap-2 flex-wrap">
              <UBadge
                :label="faithLabel(c.faith_status)"
                :color="faithColor(c.faith_status)"
                variant="soft"
                size="xs"
              />
              <span class="text-xs text-(--ui-text-muted)">{{ relLabel(c.relationship) }}</span>
            </div>
          </div>
          <UDropdownMenu :items="rowActions(c)">
            <UButton
              icon="i-lucide-more-horizontal"
              variant="ghost"
              color="neutral"
              size="sm"
              square
              aria-label="More actions"
            />
          </UDropdownMenu>
        </div>

        <p v-if="c.notes" class="mt-2 text-sm text-(--ui-text-muted) line-clamp-2">
          {{ c.notes }}
        </p>

        <div class="mt-3 grid grid-cols-2 gap-2">
          <UButton
            icon="i-lucide-message-circle"
            variant="soft"
            color="info"
            size="sm"
            block
            @click="emit('mark-contacted', c.id)"
          >
            {{ relativeTime(c.last_contacted_at) }}
          </UButton>
          <UButton
            icon="i-lucide-hand-heart"
            variant="soft"
            color="success"
            size="sm"
            block
            @click="emit('mark-prayed', c.id)"
          >
            {{ relativeTime(c.last_prayed_at) }}
          </UButton>
        </div>
      </div>

      <div
        v-if="contacts.length === 0"
        data-testid="contacts-empty-state"
        class="py-12 text-center text-(--ui-text-muted) text-sm"
      >
        Your list is empty. Tap "Add contact" to begin.
      </div>
    </div>
  </div>
</template>
