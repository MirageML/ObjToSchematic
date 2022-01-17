import { BaseUIElement } from '../layout';
import { assert } from '../../util';

export interface ComboBoxItem {
    id: string;
    displayText: string;
}

export class ComboBoxElement extends BaseUIElement {
    private _items: ComboBoxItem[];

    public constructor(id: string, items: ComboBoxItem[]) {
        super(id);
        this._items = items;
    }

    public generateHTML() {
        let itemsHTML = '';
        for (const item of this._items) {
            itemsHTML += `<option value="${item.id}">${item.displayText}</option>`;
        }

        return `
        <select name="${this._id}" id="${this._id}">
            ${itemsHTML}
        </select>
        `;
    }

    public registerEvents(): void {
    }

    public getValue() {
        const element = document.getElementById(this._id) as HTMLSelectElement;
        assert(element !== null);
        return this._items[element.selectedIndex].id;
    }

    protected _onEnabledChanged() {
        const element = document.getElementById(this._id) as HTMLSelectElement;
        assert(element !== null);
        element.disabled = !this._isEnabled;
    }
}
