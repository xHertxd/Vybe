import type { MediaItem } from '../types.js';

export interface RemoveResult {
  queue: MediaItem[];
  currentIndex: number;
  removedCurrent: boolean;
}

export interface ReorderResult {
  queue: MediaItem[];
  currentIndex: number;
}

/**
 * Pure queue operations. Keeping these separate from room/presence logic makes
 * the current-index bookkeeping easy to test and reason about.
 */
export class UnifiedMediaQueue {
  public static append(queue: MediaItem[], item: MediaItem): MediaItem[] {
    return [...queue, item];
  }

  public static remove(queue: MediaItem[], currentIndex: number, itemId: string): RemoveResult {
    const removeIndex = queue.findIndex((item) => item.id === itemId);
    if (removeIndex === -1) {
      return { queue, currentIndex, removedCurrent: false };
    }

    const nextQueue = queue.filter((item) => item.id !== itemId);
    let nextIndex = currentIndex;

    if (removeIndex < currentIndex) {
      nextIndex = Math.max(0, currentIndex - 1);
    } else if (removeIndex === currentIndex) {
      nextIndex = Math.min(currentIndex, Math.max(0, nextQueue.length - 1));
    }

    return {
      queue: nextQueue,
      currentIndex: nextQueue.length === 0 ? 0 : nextIndex,
      removedCurrent: removeIndex === currentIndex,
    };
  }

  public static reorder(
    queue: MediaItem[],
    currentIndex: number,
    fromIndex: number,
    toIndex: number
  ): ReorderResult {
    if (
      fromIndex < 0 ||
      fromIndex >= queue.length ||
      toIndex < 0 ||
      toIndex >= queue.length ||
      fromIndex === toIndex
    ) {
      return { queue, currentIndex };
    }

    const nextQueue = [...queue];
    const [moved] = nextQueue.splice(fromIndex, 1);
    nextQueue.splice(toIndex, 0, moved);

    let nextIndex = currentIndex;
    if (currentIndex === fromIndex) {
      nextIndex = toIndex;
    } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
      nextIndex = currentIndex - 1;
    } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
      nextIndex = currentIndex + 1;
    }

    return { queue: nextQueue, currentIndex: nextIndex };
  }
}
