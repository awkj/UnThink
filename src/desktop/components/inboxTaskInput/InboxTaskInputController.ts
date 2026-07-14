import { IWorkbenchInstance } from "@/services/instance/instanceService"
import { Emitter, Event } from "@hamsterbase/foundation/event"
import { ITodoService } from "@/services/todo/todoService"

export const INBOX_TASK_INPUT_CONTROLLER_KEY = "inbox-task-input-controller"

export interface CreateTaskEvent {
  title: string
}

export class InboxTaskInputController implements IWorkbenchInstance {
  get instanceState(): unknown {
    return this._inputValue
  }

  private readonly _onInputValueChange = new Emitter<string>()

  get onInputValueChange(): Event<string> {
    if (this._dispose) {
      throw new Error("InboxTaskInputController is disposed")
    }
    return this._onInputValueChange.event
  }

  private _inputValue: string = ""
  private _dispose = false

  constructor(@ITodoService private todoService: ITodoService) {}

  get inputValue(): string {
    return this._inputValue
  }

  updateInputValue(value: string): void {
    if (this._inputValue !== value) {
      this._inputValue = value
      this._onInputValueChange.fire(value)
    }
  }

  createTask(): void {
    if (this._inputValue.trim()) {
      this.todoService.fireTaskCommand({
        type: "createTask",
        title: this._inputValue.trim(),
        disableAutoFocus: true,
      })
      this.updateInputValue("")
    }
  }

  mount(): void {}
  unmount(): void {}
}
