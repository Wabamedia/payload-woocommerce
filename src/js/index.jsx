import React, { useEffect, useRef, useState } from 'react';
import * as ReactDOM from 'react-dom';
import { decodeEntities } from '@wordpress/html-entities';
import {
	PaymentForm,
	PaymentMethodForm,
	Card,
	PayloadInput,
} from 'payload-react';

import '../css/style.scss';
/* global MutationObserver */

const { registerPaymentMethod } = window.wc.wcBlocksRegistry;
const { getSetting } = window.wc.wcSettings;

const settings = getSetting( 'payload', {} );
const label =
	decodeEntities( settings.title ) ||
	window.wp.i18n.__( 'Credit/Debit Card', 'payload' );

const PaymentMethodFields = () => {
	const [ nameInvalidMessage, setNameInvalidMessage ] = useState();
	const [ cardInvalidMessage, setCardInvalidMessage ] = useState();

	return (
		<div className="pl-form-container">
			<div className="pl-form-control">
				<label
					className="pl-input-label"
					htmlFor="payload-account-holder"
				>
					Name on card
				</label>
				<PayloadInput
					id="payload-account-holder"
					attr="account_holder"
					placeholder="First and last"
					onInvalid={ ( evt ) => {
						setNameInvalidMessage( evt.message );
					} }
					onValid={ () => setNameInvalidMessage( null ) }
				/>
				<div className="pl-invalid-hint">{ nameInvalidMessage }</div>
			</div>
			<div className="pl-form-control">
				<label className="pl-input-label" htmlFor="payload-card">
					Card details
				</label>
				<Card
					id="payload-card"
					className="payload-card-input"
					onInvalid={ ( evt ) => {
						setCardInvalidMessage( evt.message );
					} }
					onValid={ () => setCardInvalidMessage( null ) }
				/>
				<div className="pl-invalid-hint">{ cardInvalidMessage }</div>
			</div>
		</div>
	);
};

const Content = ( props ) => {
	const { eventRegistration, emitResponse, billing } = props;
	const { onPaymentSetup } = eventRegistration;
	const [ clientToken, setClientToken ] = useState();
	const paymentFormRef = useRef( null );
	const hasSubscription = !! props.cartData.extensions?.subscriptions?.length;

	useEffect( () => {
		wp.apiFetch( { path: 'wc/v3/payload_client_token' } ).then( ( data ) =>
			setClientToken( data.client_token )
		);

		const unsubscribe = onPaymentSetup( async () => {
			try {
				const result = await paymentFormRef.current.submit();
				return {
					type: emitResponse.responseTypes.SUCCESS,
					meta: {
						paymentMethodData: {
							transactionId: result.transaction_id,
						},
					},
				};
			} catch ( e ) {
				let errorMessage;
				if ( e.data?.error_type !== 'InvalidAttributes' ) {
					errorMessage = e.data?.error_description;
				}

				return {
					type: emitResponse.responseTypes.ERROR,
					message: errorMessage ?? 'There was an error',
				};
			}
		} );

		// Unsubscribes when this component is unmounted.
		return () => {
			unsubscribe();
		};
	}, [
		emitResponse.responseTypes.ERROR,
		emitResponse.responseTypes.SUCCESS,
		onPaymentSetup,
	] );

	return (
		<>
			{ decodeEntities( settings.description || '' ) }
			<PaymentForm
				ref={ paymentFormRef }
				clientToken={ clientToken }
				styles={ { invalid: 'pl-input-invalid' } }
				preventDefaultOnSubmit={ true }
				payment={ {
					amount: billing.cartTotal.value / 100,
					payment_method: {
						keep_active: hasSubscription,
					},
				} }
			>
				<PaymentMethodFields />
			</PaymentForm>
		</>
	);
};

const AddPaymentMethod = () => {
	const [ clientToken, setClientToken ] = useState();
	const [ paymentMethodId, setPaymentMethodId ] = useState();
	const [ generalErrorMessage, setGeneralErrorMessage ] = useState();
	const addPaymentPaymentFormRef = useRef( null );

	const getForm = () => {
		return (
			document.getElementById( 'order_review' ) ??
			document.getElementById( 'add_payment_method' )
		);
	};

	useEffect( () => {
		wp.apiFetch( {
			path: 'wc/v3/payload_client_token?type=payment_method',
		} ).then( ( data ) => setClientToken( data.client_token ) );

		const form = getForm();
		const submitBtn = document.getElementById( 'place_order' );

		const preventDefault = ( evt ) => {
			evt.preventDefault();
		};

		const submitPayloadForm = async ( evt ) => {
			evt.preventDefault();

			try {
				const result = await addPaymentPaymentFormRef.current.submit();
				setPaymentMethodId( result.payment_method_id );
				removeListeners();
			} catch ( e ) {
				if ( e.data?.error_type !== 'InvalidAttributes' ) {
					setGeneralErrorMessage(
						e.data?.error_description ?? 'There was an error'
					);
				}
			}
		};

		const removeListeners = () => {
			form.removeEventListener( 'submit', preventDefault );
			submitBtn.removeEventListener( 'click', submitPayloadForm );
		};

		form.addEventListener( 'submit', preventDefault );
		submitBtn.addEventListener( 'click', submitPayloadForm );

		return removeListeners;
	}, [] );

	useEffect( () => {
		if ( paymentMethodId ) {
			const submitBtn = document.getElementById( 'place_order' );
			submitBtn.click();
		}
	}, [ paymentMethodId ] );

	return (
		<>
			<PaymentMethodForm
				ref={ addPaymentPaymentFormRef }
				clientToken={ clientToken }
				styles={ { invalid: 'pl-input-invalid' } }
				preventDefaultOnSubmit={ true }
			>
				{ !! generalErrorMessage && (
					<div className="pl-form-error">{ generalErrorMessage }</div>
				) }
				<PaymentMethodFields />
			</PaymentMethodForm>
			<input
				type="hidden"
				name="payment_method_id"
				value={ paymentMethodId }
			/>
		</>
	);
};

const Label = ( props ) => {
	const { PaymentMethodLabel } = props.components;
	return <PaymentMethodLabel text={ label } />;
};

const BlockGateway = {
	name: 'payload',
	label: <Label />,
	content: <Content />,
	edit: <Content />,
	canMakePayment: () => true,
	ariaLabel: label,
	supports: {
		// showSaveOption: true,
		// showSavedCard: true,
		features: [
			'products',
			'tokenization',
			'add_payment_method',
			'subscriptions',
			'subscription_cancellation',
			'subscription_suspension',
			'subscription_reactivation',
			'subscription_amount_changes',
			'subscription_date_changes',
			'subscription_payment_method_change',
			'subscription_payment_method_change_customer',
			'subscription_payment_method_change_admin',
			'multiple_subscriptions',
		],
	},
};

registerPaymentMethod( BlockGateway );

const mountPaymentMethodForm = () => {
	if ( document.querySelector( '#payload-add-payment-method' ) ) {
		const domContainer = document.querySelector(
			'#payload-add-payment-method'
		);

		const root = ReactDOM.createRoot( domContainer );
		root.render( <AddPaymentMethod /> );
	}
};

// Lazy + safe mount for the payment method form
window.plMountPaymentMethodForm = ( () => {
	const TARGET_SELECTOR = '#payload-add-payment-method'; // Adjust this selector as needed
	let mounted = false;
	let attempted = false;

	const tryMount = () => {
		if ( mounted ) {
			return true;
		}

		const container = document.querySelector( TARGET_SELECTOR );
		if ( ! container ) {
			return false;
		}

		// If your mount function accepts a container, pass it in:
		// mountPaymentMethodForm(container);
		mountPaymentMethodForm();

		mounted = true;
		return true;
	};

	const lazyInit = () => {
		if ( attempted ) {
			return;
		}
		attempted = true;

		// 1) Try immediately (DOM might already be ready)
		if ( tryMount() ) {
			return;
		}

		// 2) Observe DOM changes for late-inserted form
		const observer = new MutationObserver( () => {
			if ( tryMount() ) {
				observer.disconnect();
			}
		} );

		observer.observe( document.documentElement, {
			childList: true,
			subtree: true,
		} );

		// 3) Fallback timeout so we don't observe forever
		setTimeout( () => {
			observer.disconnect();
		}, 15000 ); // 15s safety cap
	};

	return () => {
		if ( document.readyState === 'loading' ) {
			// DOM not ready yet → wait for it, then run lazy init
			document.addEventListener( 'DOMContentLoaded', lazyInit, {
				once: true,
			} );
		} else {
			// DOM is already ready → start lazy init now
			lazyInit();
		}
	};
} )();

window.plMountPaymentMethodForm();
