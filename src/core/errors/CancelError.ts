export class CancelError extends Error {
  constructor(message = "Operation was cancelled") {
    super(message)
    this.name = "CancelError"
  }
}
