import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FORM_DATA_BINDING_PATHS } from '../utils/form-data-binding.registry';
import { FORM_CONTRACT_VERSION } from '../utils/form-contract.util';

@ApiTags('operations')
@Controller('form-contract')
export class FormContractController {
  /**
   * Bindable path catalog (editor + mobile client).
   * `assignment.*` is an alias for `workOrder.*` when saved in dataBinding.path.
   */
  @Get('data-bindings')
  getDataBindings() {
    return {
      contractVersion: FORM_CONTRACT_VERSION,
      notes: [
        'assignment.* normalizes to workOrder.* on the server and client.',
        'shift.* paths require shiftId when calling GET /form-templates/:id/context-preview.',
      ],
      paths: FORM_DATA_BINDING_PATHS,
    };
  }

  @Get('version')
  getVersion() {
    return {
      contractVersion: FORM_CONTRACT_VERSION,
      minSupportedVersion: FORM_CONTRACT_VERSION,
      recommendedVersion: FORM_CONTRACT_VERSION,
    };
  }

  @Get('schema')
  getSchema() {
    return {
      contractVersion: FORM_CONTRACT_VERSION,
      fieldTypes: [
        'text',
        'number',
        'dropdown',
        'checkbox',
        'signature',
        'photo',
        'attachment',
        'date',
        'textarea',
        'time',
        'timesheet',
      ],
      rulesByType: {
        text: ['minLength', 'maxLength', 'pattern'],
        textarea: ['minLength', 'maxLength', 'pattern'],
        number: ['min', 'max', 'step', 'integer'],
        dropdown: ['allowMultiple', 'maxSelections'],
        date: ['minDate', 'maxDate'],
        photo: ['maxPhotos', 'maxFileSizeMb', 'acceptedMimeTypes'],
        attachment: ['maxFiles', 'maxFileSizeMb', 'acceptedMimeTypes'],
      },
      uiHints: {
        keyboardType: ['default', 'numeric', 'email-address', 'phone-pad'],
        inputMode: ['text', 'decimal', 'numeric', 'email', 'tel'],
      },
      submission: {
        dataShape: {
          '<field.id>': 'value',
          _meta: {
            contractVersion: FORM_CONTRACT_VERSION,
            normalizedAt: 'ISO_TIMESTAMP',
          },
        },
      },
      fieldDataBinding: {
        shape: {
          path: 'Canonical path from GET /form-contract/data-bindings',
          optional: 'boolean (default true) - missing data does not block the field',
        },
      },
    };
  }
}
