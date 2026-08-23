import type { Group } from '../lib/group';
import { Icon } from './Icon';
import type { IconName } from './Icon';

interface Props {
  groups: Group[];
  icon: IconName;
  onOpen: (group: Group) => void;
}

export function GroupList({ groups, icon, onOpen }: Props) {
  return (
    <ul className="group-list">
      {groups.map((group) => (
        <li key={group.key}>
          <button type="button" className="group-row" onClick={() => onOpen(group)}>
            <span className="group-cover">
              {group.cover ? <img src={group.cover} alt="" /> : <Icon name={icon} size={26} />}
            </span>
            <span className="group-text">
              <strong>{group.label}</strong>
              <span>{group.subtitle}</span>
            </span>
            <Icon name="back" size={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}
