// web-app/src/ImageUploader.js

import React, { useState, useRef } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

// [핵심 수정] 좌표 계산 오차를 없애는 정밀 크롭 함수
function getCroppedImg(image, crop, fileName) {
    const canvas = document.createElement('canvas');
    
    // 1. 현재 화면에 그려진 이미지의 정확한 크기(CSS 적용 후)를 가져옵니다.
    // (image.width 대신 getBoundingClientRect()를 써야 모바일/줌인 상태에서도 정확합니다)
    const rect = image.getBoundingClientRect();
    const scaleX = image.naturalWidth / rect.width;
    const scaleY = image.naturalHeight / rect.height;

    // 2. 디바이스 픽셀 비율(DPI)을 고려하여 선명도 유지
    const pixelRatio = window.devicePixelRatio || 1;

    // 3. 캔버스 크기를 원본 해상도 비율에 맞춰 설정
    canvas.width = crop.width * scaleX * pixelRatio;
    canvas.height = crop.height * scaleY * pixelRatio;

    const ctx = canvas.getContext('2d');

    // 4. 픽셀 비율 보정
    ctx.scale(pixelRatio, pixelRatio);
    ctx.imageSmoothingQuality = 'high';

    // 5. 원본 이미지에서 정확한 좌표를 계산하여 가져옴
    const cropX = crop.x * scaleX;
    const cropY = crop.y * scaleY;
    const cropWidth = crop.width * scaleX;
    const cropHeight = crop.height * scaleY;

    ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth, // 캔버스에 그려질 너비 (비율 유지)
        cropHeight // 캔버스에 그려질 높이
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('Canvas is empty'));
                return;
            }
            blob.name = fileName;
            // 화질 최대로 파일 생성
            const file = new File([blob], fileName, { type: blob.type });
            resolve(file);
        }, 'image/jpeg', 1.0);
    });
}

function ImageUploader({ onUploadSuccess, userSettings }) {
    
    const [croppedImageFile, setCroppedImageFile] = useState(null);
    const [croppedImagePreview, setCroppedImagePreview] = useState(null);
    
    const [originalImageSrc, setOriginalImageSrc] = useState(null);
    const [originalImageFile, setOriginalImageFile] = useState(null);
    
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [crop, setCrop] = useState();
    const [completedCrop, setCompletedCrop] = useState(null);
    const imgRef = useRef(null);

    const [isUploading, setIsUploading] = useState(false);
    
    const handleImageChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            setOriginalImageFile(file);
            setOriginalImageSrc(URL.createObjectURL(file));
            setIsCropModalOpen(true); 
            // 크롭 초기값 설정은 이미지 로드(onLoad) 시점으로 이동했습니다.
        }
    };

    // [추가] 이미지가 로드되었을 때 중앙에 크롭 영역 자동 설정
    const onImageLoad = (e) => {
        const { width, height } = e.currentTarget;
        const cropWidthInPercent = 80; // 초기 영역 크기 (80%)

        const crop = centerCrop(
            makeAspectCrop(
                {
                    unit: '%',
                    width: cropWidthInPercent,
                },
                width / height, // 비율 유지 안 함 (자유롭게 자르기 위해)
                width,
                height
            ),
            width,
            height
        );
        setCrop(crop);
        setCompletedCrop(crop);
    };

    const handleCropConfirm = async () => {
        // completedCrop이 없거나 크기가 0이면 리턴
        if (!completedCrop?.width || !completedCrop?.height || !imgRef.current) {
            alert('이미지를 잘라낼 영역을 선택해주세요.');
            return;
        }

        try {
            const croppedFile = await getCroppedImg(
                imgRef.current,
                completedCrop,
                originalImageFile.name
            );
            
            setCroppedImageFile(croppedFile); 
            setCroppedImagePreview(URL.createObjectURL(croppedFile));

            setIsCropModalOpen(false);
            setOriginalImageSrc(null);
            setOriginalImageFile(null);

        } catch (e) {
            console.error('Crop failed', e);
            alert('이미지를 자르는 데 실패했습니다.');
        }
    };
    
    const handleUpload = async () => {
        if (!croppedImageFile) {
            alert('이미지를 먼저 선택하고 잘라주세요.');
            return;
        }

        setIsUploading(true);

        try {
            const formData = new FormData();
            formData.append('image', croppedImageFile);
            formData.append('settings', JSON.stringify(userSettings));
            
            // [핵심 수정] http://localhost:5000 삭제 -> 상대 경로 사용
            // 이렇게 해야 ngrok이나 맥/윈도우 어디서든 작동합니다.
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                onUploadSuccess([
                    { status: 'danger', type: '서버 오류', ingredients: [errorData.message || '서버 오류'] }
                ]);
                return;
            }

            const result = await response.json();
            onUploadSuccess(result.analysisResult);

        } catch (error) {
            console.error("Upload Error:", error);
            onUploadSuccess([
                { status: 'danger', type: '통신 오류', ingredients: [`서버 연결 실패: ${error.message}`] }
            ]);
        } finally {
            setIsUploading(false);
        }
    };
    
    const handleClearImage = () => {
        setCroppedImageFile(null);
        setCroppedImagePreview(null);
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.value = null;
    };

    return (
        <div className="image-uploader-container">
            <input 
                id="file-input"
                type="file" 
                accept="image/*" 
                onChange={handleImageChange} 
                disabled={isUploading} 
                style={{ display: 'none' }}
            />
            
            {!croppedImagePreview && (
                <>
                    <label htmlFor="file-input" className="custom-file-button">
                        📷 성분표 촬영 / 선택하기
                    </label>
                </>
            )}

            {croppedImagePreview && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
                    <p style={{ fontWeight: 'bold', marginBottom: '10px' }}>선택된 영역 미리보기:</p>
                    
                    <img 
                        src={croppedImagePreview} 
                        alt="Cropped Preview" 
                        style={{ 
                            maxWidth: '100%', 
                            maxHeight: '300px', 
                            border: '2px solid #854679', 
                            borderRadius: '8px',
                            marginBottom: '15px',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                        }}
                    />

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleUpload} disabled={isUploading} className="analyze-button">
                            {isUploading ? '분석 중... ⏳' : '🔍 이대로 분석하기'}
                        </button>
                        <button onClick={handleClearImage} disabled={isUploading} className="change-image-button">
                            다시 선택
                        </button>
                    </div>
                </div>
            )}

            {isCropModalOpen && (
                <div className="crop-modal-backdrop">
                    <div className="crop-modal-content">
                        <h3>영역 선택</h3>
                        <p style={{fontSize: '0.9rem', color: '#666', marginBottom: '10px'}}>
                            성분표 글자가 잘 보이게 박스를 조절해주세요.
                        </p>
                        <div className="crop-modal-cropper-container">
                            <ReactCrop
                                crop={crop}
                                onChange={(c) => setCrop(c)}
                                onComplete={(c) => setCompletedCrop(c)}
                                aspect={null} // 비율 자유롭게
                            >
                                <img 
                                    ref={imgRef}
                                    src={originalImageSrc} 
                                    alt="Crop target"
                                    onLoad={onImageLoad}
                                    // [스타일 수정] 이미지가 모달 밖으로 튀어나가지 않게 제한
                                    style={{ 
                                        maxWidth: '100%', 
                                        maxHeight: '60vh',
                                        transform: 'none' 
                                    }} 
                                />
                            </ReactCrop>
                        </div>
                        <div className="crop-modal-buttons">
                            <button onClick={handleCropConfirm} className="analyze-button">
                                ✅ 자르기 완료
                            </button>
                            <button onClick={() => setIsCropModalOpen(false)} className="change-image-button">
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ImageUploader;