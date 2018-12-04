// @flow
import {validateMnemonic, wordlists} from 'bip39'
import _ from 'lodash'

import {containsUpperCase, containsLowerCase, isNumeric} from '../utils/string'
import {CONFIG} from '../config'
import {isValidAddress} from '../crypto/util'
import assert from '../utils/assert'
import {parseAdaDecimal, InvalidAdaAmount} from '../utils/parsing'

export type PasswordValidationErrors = {
  passwordReq?: boolean,
  passwordConfirmationReq?: boolean,
  matchesConfirmation?: boolean,
  passwordIsWeak?: boolean,
}

export type WalletNameValidationErrors = {
  walletNameLength?: boolean,
  nameIsAlreadyTaken?: boolean,
}

export type AddressValidationErrors = {
  addressIsRequired?: boolean,
  invalidAddress?: boolean,
}

export type AmountValidationErrors = {
  amountIsRequired?: boolean,
  invalidAmount?: $Values<typeof InvalidAdaAmount.ERROR_CODES>,
}

export type BalanceValidationErrors = {
  insufficientBalance?: boolean,
}

export const INVALID_PHRASE_ERROR_CODES = {
  TOO_LONG: 'TOO_LONG',
  TOO_SHORT: 'TOO_SHORT',
  UNKNOWN_WORDS: 'UNKNOWN_WORDS',
  INVALID_CHECKSUM: 'INVALID_CHECKSUM',
}

export type InvalidPhraseErrorCode = $Values<typeof INVALID_PHRASE_ERROR_CODES>
export type InvalidPhraseError =
  | {
      code: 'TOO_LONG' | 'TOO_SHORT' | 'INVALID_CHECKSUM',
    }
  | {
      code: 'UNKNOWN_WORDS',
      words: Array<string>,
      lastMightBeUnfinished: boolean,
    }

export type RecoveryPhraseErrors = {
  invalidPhrase: Array<InvalidPhraseError>,
  minLength?: boolean,
}

export type PasswordStrength = {
  isStrong: boolean,
  hasSevenCharacters?: boolean,
  hasUppercase?: boolean,
  hasLowercase?: boolean,
  hasDigit?: boolean,
  hasTwelveCharacters?: boolean,
}

export const getPasswordStrength = (password: string): PasswordStrength => {
  if (!password) {
    return {isStrong: false}
  }

  if (password.length >= 12) {
    return {isStrong: true, hasTwelveCharacters: true}
  } else if (!CONFIG.ALLOW_SHORT_PASSWORD) {
    return {isStrong: false}
  }

  const validation = {
    hasSevenCharacters: password.length >= 7,
    hasUppercase: containsUpperCase(password),
    hasLowercase: containsLowerCase(password),
    hasDigit: password.split('').some(isNumeric),
  }

  return {...validation, isStrong: Object.values(validation).every((x) => x)}
}

export const validatePassword = (
  password: string,
  passwordConfirmation: string,
): PasswordValidationErrors => {
  let validations = {}
  if (!password) {
    validations = {...validations, passwordReq: true}
  }
  if (!passwordConfirmation) {
    validations = {...validations, passwordConfirmationReq: true}
  }
  if (password !== passwordConfirmation) {
    validations = {...validations, matchesConfirmation: true}
  }
  if (!getPasswordStrength(password).isStrong) {
    validations = {...validations, passwordIsWeak: true}
  }

  return validations
}

export const validateWalletName = (
  newWalletName: string,
  oldWalletName: ?string,
  walletNames: Array<string>,
): WalletNameValidationErrors => {
  let validations = {}

  if (newWalletName.length < 1 || newWalletName.length > 40) {
    validations = {...validations, walletNameLength: true}
  }
  if (
    newWalletName !== oldWalletName &&
    walletNames.some((x) => newWalletName === x)
  ) {
    validations = {...validations, nameIsAlreadyTaken: true}
  }

  return validations
}

export const getWalletNameError = (
  translations: {
    incorrectNumberOfCharacters: string,
    nameAlreadyTaken: string,
  },
  validationErrors: WalletNameValidationErrors,
) => {
  const {incorrectNumberOfCharacters, nameAlreadyTaken} = translations

  if (validationErrors.walletNameLength) {
    return incorrectNumberOfCharacters
  } else if (validationErrors.nameIsAlreadyTaken) {
    return nameAlreadyTaken
  } else {
    return null
  }
}

export const validateAddressAsync = async (
  address: string,
): Promise<AddressValidationErrors> => {
  if (!address) {
    return {addressIsRequired: true}
  }

  const isValid = await isValidAddress(address)
  return isValid ? {} : {invalidAddress: true}
}

export const validateAmount = (value: string): AmountValidationErrors => {
  if (!value) {
    return {amountIsRequired: true}
  }

  try {
    parseAdaDecimal(value)
    return {}
  } catch (e) {
    if (e instanceof InvalidAdaAmount) {
      return {invalidAmount: e.errorCode}
    }
    throw e
  }
}

wordlists.EN.forEach((word) => {
  assert.assert(
    word === word.toLowerCase(),
    'we expect wordlist to contain only lowercase words',
  )
})

const MNEMONIC_LENGTH = 15

export const cleanMnemonic = (mnemonic: string) => {
  // get rid of common punctuation
  mnemonic = mnemonic.replace(/[.,?]/g, ' ')
  // normalize whitespace
  mnemonic = mnemonic.replace(/\s+/g, ' ')
  // dictionary does not contain uppercase characters
  mnemonic = mnemonic.toLowerCase()
  // remove leading/trailing whitespace
  return mnemonic.trim()
}

export const validateRecoveryPhrase = (mnemonic: string) => {
  const cleaned = cleanMnemonic(mnemonic)
  const words = cleaned.split(' ')

  const tooShort = words.length < MNEMONIC_LENGTH
  const tooLong = words.length > MNEMONIC_LENGTH
  const invalidPhraseErrors = []

  if (tooLong) {
    invalidPhraseErrors.push({code: INVALID_PHRASE_ERROR_CODES.TOO_LONG})
  }

  if (tooShort) {
    invalidPhraseErrors.push({code: INVALID_PHRASE_ERROR_CODES.TOO_SHORT})
  }

  const isUnknown = (word) => !wordlists.EN.includes(word)

  const unknownWords: Array<string> = words.filter(isUnknown)

  if (unknownWords.length > 0) {
    invalidPhraseErrors.push({
      code: INVALID_PHRASE_ERROR_CODES.UNKNOWN_WORDS,
      words: unknownWords,
      lastMightBeUnfinished:
        isUnknown(_.last(words)) && !mnemonic.endsWith(' '),
    })
  }

  if (invalidPhraseErrors.length > 0) {
    return {
      invalidPhrase: invalidPhraseErrors,
    }
  } else if (!validateMnemonic(cleaned)) {
    return {
      invalidPhrase: [{code: INVALID_PHRASE_ERROR_CODES.INVALID_CHECKSUM}],
    }
  } else {
    return {}
  }
}
