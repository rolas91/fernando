import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FORM_CONTRACT_VERSION } from '../utils/form-contract.util';

@ApiTags('operations')
@Controller('form-contract')
export class FormContractController {
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
        'date',
        'textarea',
        'time',
      ],
      rulesByType: {
        text: ['minLength', 'maxLength', 'pattern'],
        textarea: ['minLength', 'maxLength', 'pattern'],
        number: ['min', 'max', 'step', 'integer'],
        dropdown: ['allowMultiple', 'maxSelections'],
        date: ['minDate', 'maxDate'],
        photo: ['maxPhotos', 'maxFileSizeMb', 'acceptedMimeTypes'],
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
    };
  }
}
