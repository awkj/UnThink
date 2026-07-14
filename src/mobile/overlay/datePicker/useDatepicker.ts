import { useService } from "@/ui/hooks/use-service"
import { IInstantiationService } from "@hamsterbase/foundation/instantiation"
import { DatePickerActionSheetController } from "./DatePickerActionSheetController"
import { CancelError } from "@/core/errors/CancelError"

interface DatePickerOptions {
  initialDate?: number | undefined
  onDateSelected: (date: number) => Promise<void> | void
  onCancel?: () => void
}

export const useMobileDatepicker = () => {
  const instantiationService = useService(IInstantiationService)

  return {
    showDatePicker: (options: DatePickerOptions) => {
      DatePickerActionSheetController.create(
        options.initialDate,
        options.onDateSelected,
        options.onCancel || (() => {}),
        instantiationService,
      )
    },
    showDatePickerPromise: (initialDate?: number): Promise<number> => {
      return new Promise((resolve, reject) => {
        DatePickerActionSheetController.create(
          initialDate,
          (date: number) => {
            resolve(date)
          },
          () => {
            reject(new CancelError())
          },
          instantiationService,
        )
      })
    },
  }
}
