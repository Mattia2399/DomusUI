const INTERACTIVE_CARD_TARGET_SELECTOR =
  'button,input,select,textarea,a,[contenteditable="true"]';

const CONTEXT_LONG_PRESS_TARGET_SELECTOR =
  '[data-card-context-long-press="true"]';

/**
 * Operational controls (sliders, quick actions, links) own a press gesture and
 * must not open the card context panel. A card's primary surface action can opt
 * back into long-press while retaining its normal short-tap behavior.
 */
export function isCardContextLongPressBlockedTarget(target: EventTarget | null) {
  const targetNode = target as Element | null;
  if (!targetNode || typeof targetNode.closest !== 'function') {
    return false;
  }

  const interactiveTarget = targetNode.closest(INTERACTIVE_CARD_TARGET_SELECTOR);
  return Boolean(
    interactiveTarget &&
      !interactiveTarget.matches(CONTEXT_LONG_PRESS_TARGET_SELECTOR),
  );
}
