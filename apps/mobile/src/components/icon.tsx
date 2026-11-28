import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

/** One name per concept, mapped to SF Symbols (iOS) and Material Symbols (Android). */
const ICONS = {
  jobs: { ios: 'briefcase', android: 'work' },
  jobsFill: { ios: 'briefcase.fill', android: 'work' },
  saved: { ios: 'bookmark', android: 'bookmark_border' },
  savedFill: { ios: 'bookmark.fill', android: 'bookmark' },
  applications: { ios: 'doc.text', android: 'description' },
  applicationsFill: { ios: 'doc.text.fill', android: 'description' },
  profile: { ios: 'person.crop.circle', android: 'person' },
  profileFill: { ios: 'person.crop.circle.fill', android: 'person' },
  search: { ios: 'magnifyingglass', android: 'search' },
  filters: { ios: 'slider.horizontal.3', android: 'tune' },
  verified: { ios: 'checkmark.seal.fill', android: 'verified' },
  close: { ios: 'xmark', android: 'close' },
  check: { ios: 'checkmark', android: 'check' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on' },
  time: { ios: 'clock', android: 'schedule' },
  pay: { ios: 'dollarsign.circle', android: 'payments' },
  star: { ios: 'star.fill', android: 'star' },
  shield: { ios: 'checkmark.shield.fill', android: 'shield' },
  identity: { ios: 'person.text.rectangle', android: 'badge' },
  rightToWork: { ios: 'globe.asia.australia', android: 'public' },
  qualification: { ios: 'graduationcap', android: 'school' },
  upload: { ios: 'doc.badge.arrow.up', android: 'upload_file' },
  signOut: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  trash: { ios: 'trash', android: 'delete' },
  edit: { ios: 'pencil', android: 'edit' },
  mail: { ios: 'envelope', android: 'mail' },
  badge: { ios: 'rosette', android: 'workspace_premium' },
  done: { ios: 'checkmark.circle.fill', android: 'task_alt' },
  circle: { ios: 'circle', android: 'radio_button_unchecked' },
  error: { ios: 'exclamationmark.circle', android: 'error' },
  camera: { ios: 'camera.fill', android: 'photo_camera' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome' },
  photos: { ios: 'photo.on.rectangle', android: 'photo_library' },
  addPhoto: { ios: 'photo.badge.plus', android: 'add_photo_alternate' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  add: { ios: 'plus', android: 'add' },
  minus: { ios: 'minus', android: 'remove' },
  scissors: { ios: 'scissors', android: 'content_cut' },
  travel: { ios: 'car', android: 'directions_car' },
  phone: { ios: 'phone', android: 'call' },
  inbox: { ios: 'tray', android: 'inbox' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  eye: { ios: 'eye', android: 'visibility' },
  chat: { ios: 'bubble.left', android: 'chat' },
  lock: { ios: 'lock', android: 'lock' },
  quote: { ios: 'quote.bubble', android: 'format_quote' },
  settings: { ios: 'gearshape', android: 'settings' },
  bell: { ios: 'bell', android: 'notifications' },
  appearance: { ios: 'circle.lefthalf.filled', android: 'contrast' },
  info: { ios: 'info.circle', android: 'info' },
  wrench: { ios: 'wrench.and.screwdriver', android: 'build' },
  people: { ios: 'person.2', android: 'group' },
  store: { ios: 'storefront', android: 'store' },
  swap: { ios: 'arrow.left.arrow.right', android: 'swap_horiz' },
  web: { ios: 'safari', android: 'open_in_browser' },
} as const satisfies Record<string, Exclude<SymbolName, string>>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} style={style} />;
}
